import os, sys
import site
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
VENV = BASE_DIR / ".venv"

# Add project root
sys.path.insert(0, str(BASE_DIR))

# Activate venv site-packages
py_ver = f"python{sys.version_info.major}.{sys.version_info.minor}"
site_packages = VENV / "lib" / py_ver / "site-packages"
if site_packages.exists():
    site.addsitedir(str(site_packages))

# Ensure venv bin is used
os.environ["PATH"] = str(VENV / "bin") + os.pathsep + os.environ.get("PATH", "")

# Load .env
from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")

# Import Flask app
from app import create_app
application = create_app()
