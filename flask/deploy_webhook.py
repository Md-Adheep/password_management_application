"""
deploy_webhook.py — Flask Blueprint for Plesk auto-deployment

Receives POST from GitHub Actions, validates the token, returns 200 immediately,
then runs the actual deployment in a background thread (download → copy → pip → restart).

Register in app.py:
    from deploy_webhook import deploy_webhook_bp
    app.register_blueprint(deploy_webhook_bp)
"""

import os
import hmac
import logging
import zipfile
import shutil
import tempfile
import subprocess
import threading
from datetime import datetime
from pathlib import Path

import urllib.request
from flask import Blueprint, request, jsonify

# ─── Config ───────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent

GITHUB_USERNAME = "Md-Adheep"
GITHUB_REPO     = "password_management_application"
ZIP_URL         = f"https://github.com/{GITHUB_USERNAME}/{GITHUB_REPO}/archive/refs/heads/main.zip"

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
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a") as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[{timestamp}] {msg}")


def _run_deploy(branch, commit, pusher):
    """Runs the full deployment. Called in a background thread."""
    _log(f"[DEPLOY START] branch={branch} commit={commit} pusher={pusher}")
    try:
        # 1. Download ZIP
        _log(f"[DOWNLOAD] {ZIP_URL}")
        tmp_fd, tmp_zip = tempfile.mkstemp(suffix=".zip")
        os.close(tmp_fd)
        urllib.request.urlretrieve(ZIP_URL, tmp_zip)
        _log(f"[DOWNLOAD] Complete")

        # 2. Extract
        extract_dir = tempfile.mkdtemp()
        with zipfile.ZipFile(tmp_zip, "r") as z:
            z.extractall(extract_dir)
        os.remove(tmp_zip)

        # 3. Find flask/ inside extracted repo
        repo_root  = Path(extract_dir) / f"{GITHUB_REPO}-main"
        source_dir = repo_root / "flask"
        if not source_dir.exists():
            raise FileNotFoundError(f"flask/ folder not found in ZIP: {source_dir}")

        # 4. Copy files, skipping protected ones
        files_copied = []
        for item in source_dir.rglob("*"):
            if not item.is_file():
                continue
            relative = item.relative_to(source_dir)
            if relative.name in PROTECTED_FILES:
                _log(f"[SKIP] Protected: {relative}")
                continue
            if "__pycache__" in relative.parts:
                continue
            dest = BASE_DIR / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dest)
            files_copied.append(str(relative))

        shutil.rmtree(extract_dir)
        _log(f"[COPY] {len(files_copied)} files copied")

        # 5. pip install
        req_file = BASE_DIR / "requirements.txt"
        if req_file.exists():
            _log("[PIP] Installing requirements...")
            subprocess.run(
                ["pip", "install", "-r", str(req_file), "--quiet"],
                check=True, capture_output=True
            )
            _log("[PIP] Done")

        # 6. Restart Passenger
        tmp_dir = BASE_DIR / "tmp"
        tmp_dir.mkdir(exist_ok=True)
        (tmp_dir / "restart.txt").touch()
        _log("[RESTART] Touched tmp/restart.txt")

        _log(f"[DEPLOY DONE] {len(files_copied)} files from commit {commit}")

    except Exception as e:
        _log(f"[ERROR] Deployment failed: {e}")


@deploy_webhook_bp.route("/deploy-webhook", methods=["POST"])
def deploy_webhook():
    # 1. Validate token
    deploy_secret = os.environ.get("DEPLOY_SECRET", "")
    if not deploy_secret:
        _log("[ERROR] DEPLOY_SECRET not set")
        return jsonify({"success": False, "message": "Server misconfigured"}), 500

    incoming_token = request.headers.get("X-Deploy-Token", "")
    if not hmac.compare_digest(incoming_token, deploy_secret):
        _log("[WARN] Rejected — invalid token")
        return jsonify({"success": False, "message": "Forbidden"}), 403

    # 2. Parse body
    data   = request.get_json(silent=True) or {}
    branch = data.get("branch", "unknown")
    commit = data.get("commit", "unknown")[:7]
    pusher = data.get("pusher", "unknown")

    # 3. Start deployment in background — return 200 immediately
    t = threading.Thread(target=_run_deploy, args=(branch, commit, pusher), daemon=True)
    t.start()

    _log(f"[QUEUED] Deployment started in background for commit {commit}")
    return jsonify({
        "success": True,
        "branch":  branch,
        "commit":  commit,
        "message": "Deployment started in background. Check deploy.log for progress."
    }), 200
