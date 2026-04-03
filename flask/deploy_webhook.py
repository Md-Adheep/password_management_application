"""
deploy_webhook.py — Flask Blueprint for Plesk auto-deployment

Receives POST from GitHub Actions, downloads the latest repo ZIP,
copies files into the live server directory, and restarts the app.

Register in app.py:
    from deploy_webhook import deploy_webhook_bp
    app.register_blueprint(deploy_webhook_bp)
"""

import os
import hmac
import hashlib
import logging
import zipfile
import shutil
import tempfile
import subprocess
from datetime import datetime
from pathlib import Path

import urllib.request
from flask import Blueprint, request, jsonify

# ─── Config ───────────────────────────────────────────────────────────────────
# Root directory of the Flask app on the server (same folder as this file)
BASE_DIR = Path(__file__).resolve().parent

# GitHub repo details
GITHUB_USERNAME = "Md-Adheep"
GITHUB_REPO     = "password_management_application"
ZIP_URL         = f"https://github.com/{GITHUB_USERNAME}/{GITHUB_REPO}/archive/refs/heads/main.zip"

# Files that must NEVER be overwritten during deploy
PROTECTED_FILES = {
    "deploy_webhook.py",
    ".env",
    "deploy.log",
    "config.py",
}

# ─── Logging ──────────────────────────────────────────────────────────────────
LOG_FILE = BASE_DIR / "deploy.log"
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(),
    ]
)
log = logging.getLogger("deploy")

# ─── Blueprint ────────────────────────────────────────────────────────────────
deploy_webhook_bp = Blueprint("deploy_webhook", __name__)


def _log(msg):
    """Write a timestamped line to deploy.log."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a") as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[{timestamp}] {msg}")


@deploy_webhook_bp.route("/deploy-webhook", methods=["POST"])
def deploy_webhook():
    # ── 1. Validate deploy token ──────────────────────────────────────────────
    deploy_secret = os.environ.get("DEPLOY_SECRET", "")
    if not deploy_secret:
        _log("[ERROR] DEPLOY_SECRET environment variable is not set.")
        return jsonify({"success": False, "message": "Server misconfigured"}), 500

    incoming_token = request.headers.get("X-Deploy-Token", "")
    if not hmac.compare_digest(incoming_token, deploy_secret):
        _log("[WARN] Rejected request — invalid X-Deploy-Token.")
        return jsonify({"success": False, "message": "Forbidden"}), 403

    # ── 2. Parse request body ─────────────────────────────────────────────────
    data     = request.get_json(silent=True) or {}
    branch   = data.get("branch", "unknown")
    commit   = data.get("commit", "unknown")[:7]
    pusher   = data.get("pusher", "unknown")

    _log(f"[DEPLOY START] branch={branch} commit={commit} pusher={pusher}")

    try:
        # ── 3. Download repo ZIP from GitHub ─────────────────────────────────
        _log(f"[DOWNLOAD] {ZIP_URL}")
        tmp_fd, tmp_zip = tempfile.mkstemp(suffix=".zip")
        os.close(tmp_fd)
        urllib.request.urlretrieve(ZIP_URL, tmp_zip)
        _log(f"[DOWNLOAD] Saved to {tmp_zip}")

        # ── 4. Extract ZIP ────────────────────────────────────────────────────
        extract_dir = tempfile.mkdtemp()
        with zipfile.ZipFile(tmp_zip, "r") as z:
            z.extractall(extract_dir)
        os.remove(tmp_zip)
        _log(f"[EXTRACT] Extracted to {extract_dir}")

        # ── 5. Find the flask/ subfolder inside extracted repo ────────────────
        # GitHub ZIPs extract to: REPO-main/flask/...
        repo_root = Path(extract_dir) / f"{GITHUB_REPO}-main"
        source_dir = repo_root / "flask"
        if not source_dir.exists():
            raise FileNotFoundError(f"Expected flask/ folder not found in ZIP: {source_dir}")
        _log(f"[SOURCE] {source_dir}")

        # ── 6. Copy files, skipping protected ones ────────────────────────────
        files_copied = []
        for item in source_dir.rglob("*"):
            if not item.is_file():
                continue

            relative = item.relative_to(source_dir)

            # Skip protected files (by filename, anywhere in tree)
            if relative.name in PROTECTED_FILES:
                _log(f"[SKIP] Protected: {relative}")
                continue

            # Skip __pycache__ directories
            if "__pycache__" in relative.parts:
                continue

            dest = BASE_DIR / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dest)
            files_copied.append(str(relative))

        shutil.rmtree(extract_dir)
        _log(f"[COPY] {len(files_copied)} files copied.")

        # ── 7. Install/update dependencies ───────────────────────────────────
        req_file = BASE_DIR / "requirements.txt"
        if req_file.exists():
            _log("[PIP] Installing requirements...")
            subprocess.run(
                ["pip", "install", "-r", str(req_file), "--quiet"],
                check=True, capture_output=True
            )
            _log("[PIP] Done.")

        # ── 8. Restart app via Passenger (Plesk default) ─────────────────────
        # Passenger monitors tmp/restart.txt — touching it triggers a restart.
        # If using systemd Gunicorn instead, replace with:
        #   subprocess.run(["sudo", "systemctl", "restart", "gunicorn"], check=True)
        tmp_dir = BASE_DIR / "tmp"
        tmp_dir.mkdir(exist_ok=True)
        restart_file = tmp_dir / "restart.txt"
        restart_file.touch()
        _log("[RESTART] Touched tmp/restart.txt — Passenger will restart.")

        _log(f"[DEPLOY DONE] {len(files_copied)} files deployed from commit {commit}.")
        return jsonify({
            "success":      True,
            "branch":       branch,
            "commit":       commit,
            "files_copied": len(files_copied),
            "message":      f"Deployed {len(files_copied)} files successfully."
        }), 200

    except Exception as e:
        _log(f"[ERROR] Deployment failed: {e}")
        return jsonify({"success": False, "message": str(e)}), 500
