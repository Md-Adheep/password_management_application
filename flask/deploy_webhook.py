"""
deploy_webhook.py — Releases-based auto-deployment with rollback support.

Directory layout on the server (relative to httpdocs/):
    flask/                  ← live app (Passenger serves this) = BASE_DIR
    releases/
        20240101_120000/    ← old release
        20240103_140000/    ← current release
    current_release         ← text file: name of active release

Flow:
    GitHub push → Actions → POST /deploy-webhook
    → background thread:
        1. Download repo ZIP
        2. Extract → releases/<timestamp>/
        3. pip install
        4. Sync release → flask/  (atomic-ish, fast)
        5. Restart Passenger
        6. Health check  → auto-rollback if fails
        7. Cleanup old releases (keep last 5)

Protected files (never overwritten):
    deploy_webhook.py, .env, config.py, deploy.log
"""

import hmac
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

from flask import Blueprint, request, jsonify

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).resolve().parent           # httpdocs/flask/
APP_ROOT     = BASE_DIR.parent                           # httpdocs/
RELEASES_DIR = APP_ROOT / "releases"                     # httpdocs/releases/
KEEP_RELEASES = 5

# ─── GitHub ───────────────────────────────────────────────────────────────────
GITHUB_USERNAME = "Md-Adheep"
GITHUB_REPO     = "password_management_application"
ZIP_URL         = (
    f"https://github.com/{GITHUB_USERNAME}/{GITHUB_REPO}"
    f"/archive/refs/heads/main.zip"
)

# ─── Protected files (never overwritten during any deploy or rollback) ────────
PROTECTED_FILES = {"deploy_webhook.py", ".env", "config.py", "deploy.log"}

# ─── Health check ─────────────────────────────────────────────────────────────
HEALTH_URL     = os.environ.get("HEALTH_CHECK_URL", "https://nextgen.codesen.com/health")
HEALTH_TIMEOUT = 15   # seconds to wait for a single probe
RESTART_WAIT   = 8    # seconds to let Passenger come back up before probing

# ─── Logging ──────────────────────────────────────────────────────────────────
LOG_FILE = BASE_DIR / "deploy.log"
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler()],
)
_logger = logging.getLogger("deploy")


def _log(msg: str) -> None:
    _logger.info(msg)


# ─── Blueprint ────────────────────────────────────────────────────────────────
deploy_webhook_bp = Blueprint("deploy_webhook", __name__)


# ══════════════════════════════════════════════════════════════════════════════
# Internal helpers
# ══════════════════════════════════════════════════════════════════════════════

def _get_releases():
    """Return release names sorted oldest → newest."""
    if not RELEASES_DIR.exists():
        return []
    return sorted(
        d.name for d in RELEASES_DIR.iterdir() if d.is_dir()
    )


def _get_current_release():
    marker = APP_ROOT / "current_release"
    return marker.read_text().strip() if marker.exists() else None


def _set_current_release(name):
    (APP_ROOT / "current_release").write_text(name)


def _restart_app():
    """Touch tmp/restart.txt to trigger Passenger reload."""
    tmp_dir = BASE_DIR / "tmp"
    tmp_dir.mkdir(exist_ok=True)
    (tmp_dir / "restart.txt").touch()
    _log("[RESTART] Touched tmp/restart.txt — Passenger will reload")


def _health_check():
    """Return True if the live app responds 200 at HEALTH_URL."""
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=HEALTH_TIMEOUT) as resp:
            status_ok = resp.status == 200
            _log("[HEALTH] {} → HTTP {} ({})".format(
                HEALTH_URL, resp.status, "ok" if status_ok else "FAIL"
            ))
            return status_ok
    except Exception as exc:
        _log("[HEALTH] Probe failed: {}".format(exc))
        return False


def _sync_to_live(release_dir):
    """Copy all non-protected files from release_dir → BASE_DIR. Returns file count."""
    count = 0
    for item in release_dir.rglob("*"):
        if not item.is_file():
            continue
        relative = item.relative_to(release_dir)
        if relative.name in PROTECTED_FILES:
            continue
        if "__pycache__" in relative.parts:
            continue
        dest = BASE_DIR / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, dest)
        count += 1
    return count


def _cleanup_releases(current):
    """Delete oldest releases, keeping at most KEEP_RELEASES (never delete current)."""
    releases = _get_releases()
    candidates = [r for r in releases if r != current]
    to_delete  = candidates[:-KEEP_RELEASES] if len(candidates) >= KEEP_RELEASES else []
    for name in to_delete:
        shutil.rmtree(RELEASES_DIR / name, ignore_errors=True)
        _log("[CLEANUP] Removed old release: {}".format(name))


def _do_rollback(release_name):
    """Restore release_name to the live app directory and restart. Returns True on success."""
    release_dir = RELEASES_DIR / release_name
    if not release_dir.exists():
        _log("[ROLLBACK] Release directory not found: {}".format(release_name))
        return False

    _log("[ROLLBACK] Restoring release: {}".format(release_name))
    count = _sync_to_live(release_dir)
    _set_current_release(release_name)
    _restart_app()
    _log("[ROLLBACK] Done — {} files restored from {}".format(count, release_name))
    return True


# ══════════════════════════════════════════════════════════════════════════════
# Main deploy logic  (runs in background thread)
# ══════════════════════════════════════════════════════════════════════════════

def _run_deploy(branch, commit, pusher):
    release_name = datetime.now().strftime("%Y%m%d_%H%M%S")
    release_dir  = RELEASES_DIR / release_name

    _log("=" * 60)
    _log("[DEPLOY START] branch={} commit={} pusher={}".format(branch, commit, pusher))
    _log("[RELEASE] {}".format(release_name))

    try:
        # ── 1. Create release directory ───────────────────────────────────────
        RELEASES_DIR.mkdir(parents=True, exist_ok=True)
        release_dir.mkdir()

        # ── 2. Download repo ZIP ──────────────────────────────────────────────
        _log("[DOWNLOAD] {}".format(ZIP_URL))
        tmp_fd, tmp_zip = tempfile.mkstemp(suffix=".zip")
        os.close(tmp_fd)
        urllib.request.urlretrieve(ZIP_URL, tmp_zip)
        _log("[DOWNLOAD] Complete")

        # ── 3. Extract ────────────────────────────────────────────────────────
        extract_dir = tempfile.mkdtemp()
        with zipfile.ZipFile(tmp_zip, "r") as zf:
            zf.extractall(extract_dir)
        os.remove(tmp_zip)

        # ── 4. Locate flask/ inside extracted repo ────────────────────────────
        source_dir = Path(extract_dir) / "{}-main".format(GITHUB_REPO) / "flask"
        if not source_dir.exists():
            raise FileNotFoundError("flask/ not found inside ZIP at {}".format(source_dir))

        # ── 5. Populate release directory (skip protected files) ──────────────
        files_extracted = 0
        for item in source_dir.rglob("*"):
            if not item.is_file():
                continue
            relative = item.relative_to(source_dir)
            if relative.name in PROTECTED_FILES or "__pycache__" in relative.parts:
                continue
            dest = release_dir / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dest)
            files_extracted += 1
        shutil.rmtree(extract_dir)
        _log("[EXTRACT] {} files copied to release".format(files_extracted))

        # ── 6. pip install inside release ─────────────────────────────────────
        req_file = release_dir / "requirements.txt"
        if req_file.exists():
            _log("[PIP] Installing requirements...")
            result = subprocess.run(
                ["pip", "install", "-r", str(req_file), "--quiet"],
                capture_output=True, text=True
            )
            if result.returncode != 0:
                raise RuntimeError("pip install failed: {}".format(result.stderr.strip()))
            _log("[PIP] Done")

        # ── 7. Record previous release (needed for auto-rollback) ─────────────
        previous_release = _get_current_release()
        _log("[PREV] Previous release: {}".format(previous_release or "none"))

        # ── 8. Sync release → live directory ──────────────────────────────────
        _log("[SYNC] Deploying to live directory...")
        files_deployed = _sync_to_live(release_dir)
        _log("[SYNC] {} files written".format(files_deployed))

        # ── 9. Mark as current & restart ──────────────────────────────────────
        _set_current_release(release_name)
        _restart_app()

        # ── 10. Health check ──────────────────────────────────────────────────
        _log("[HEALTH] Waiting {}s for app to restart...".format(RESTART_WAIT))
        time.sleep(RESTART_WAIT)

        if _health_check():
            _log("[HEALTH] App is healthy")
        else:
            _log("[HEALTH] Health check failed — initiating auto-rollback")
            if previous_release:
                success = _do_rollback(previous_release)
                if success:
                    _log("[ROLLBACK] Auto-rollback to {} succeeded".format(previous_release))
                else:
                    _log("[ROLLBACK] Auto-rollback also failed — manual intervention needed")
            else:
                _log("[ROLLBACK] No previous release — cannot auto-rollback")
            return

        # ── 11. Cleanup old releases ──────────────────────────────────────────
        _cleanup_releases(current=release_name)

        _log("[DEPLOY DONE] Release {} is live ({} files)".format(release_name, files_deployed))
        _log("=" * 60)

    except Exception as exc:
        _log("[ERROR] Deployment failed: {}".format(exc))
        if release_dir.exists():
            shutil.rmtree(release_dir, ignore_errors=True)
            _log("[CLEANUP] Removed failed release dir: {}".format(release_name))
        _log("=" * 60)


# ══════════════════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════════════════

@deploy_webhook_bp.route("/deploy-webhook", methods=["POST"])
def deploy_webhook():
    # ── Validate token ────────────────────────────────────────────────────────
    deploy_secret = os.environ.get("DEPLOY_SECRET", "")
    if not deploy_secret:
        _log("[ERROR] DEPLOY_SECRET not configured")
        return jsonify({"success": False, "message": "Server misconfigured"}), 500

    incoming = request.headers.get("X-Deploy-Token", "")
    if not hmac.compare_digest(incoming, deploy_secret):
        _log("[WARN] Rejected request — invalid X-Deploy-Token")
        return jsonify({"success": False, "message": "Forbidden"}), 403

    # ── Parse body ────────────────────────────────────────────────────────────
    data   = request.get_json(silent=True) or {}
    branch = data.get("branch", "unknown")
    commit = data.get("commit", "unknown")[:7]
    pusher = data.get("pusher", "unknown")

    # ── Launch background deploy, return 200 immediately ─────────────────────
    threading.Thread(
        target=_run_deploy, args=(branch, commit, pusher), daemon=True
    ).start()

    _log("[QUEUED] Deploy queued — commit={} pusher={}".format(commit, pusher))
    return jsonify({
        "success": True,
        "release": datetime.now().strftime("%Y%m%d_%H%M%S"),
        "message": "Deployment started in background. Check deploy.log for progress.",
    }), 200


@deploy_webhook_bp.route("/rollback-api", methods=["POST"])
def rollback_api():
    """
    API rollback (alternative to rollback.sh).

    Body (JSON):
        { "release": "20240101_120000" }   ← specific release
        {}                                  ← rolls back to previous release
    """
    deploy_secret = os.environ.get("DEPLOY_SECRET", "")
    incoming = request.headers.get("X-Deploy-Token", "")
    if not deploy_secret or not hmac.compare_digest(incoming, deploy_secret):
        return jsonify({"success": False, "message": "Forbidden"}), 403

    releases = _get_releases()
    if not releases:
        return jsonify({"success": False, "message": "No releases available"}), 400

    data    = request.get_json(silent=True) or {}
    target  = data.get("release")
    current = _get_current_release()

    if target:
        if target not in releases:
            return jsonify({"success": False, "message": f"Release '{target}' not found"}), 404
        rollback_to = target
    else:
        # Roll back to the release before current
        if current in releases:
            idx = releases.index(current)
            if idx == 0:
                return jsonify({"success": False, "message": "Already at oldest release"}), 400
            rollback_to = releases[idx - 1]
        else:
            rollback_to = releases[-1]

    threading.Thread(target=_do_rollback, args=(rollback_to,), daemon=True).start()
    return jsonify({
        "success": True,
        "rollback_to": rollback_to,
        "message": f"Rolling back to {rollback_to}. Check deploy.log.",
    }), 200
