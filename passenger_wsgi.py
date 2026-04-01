"""
Plesk Python (Passenger) entry point.
Plesk looks for an 'application' callable in this file.
"""
import sys
import os

# Add the backend folder to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app import create_app

application = create_app()
