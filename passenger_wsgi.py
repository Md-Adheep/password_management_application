"""
Phusion Passenger entry point for Plesk.
Passenger looks for an 'application' callable in this file.
"""
import sys
import os

# Project root (directory containing this file)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Add project root and backend folder to the path
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, 'backend'))

# Load .env with an explicit path so it works regardless of Passenger's CWD
from dotenv import load_dotenv
load_dotenv(os.path.join(BASE_DIR, 'backend', '.env'))

from app import create_app

application = create_app()
