"""
CI smoke tests for CorpVault.
Uses SQLite in-memory so no MySQL server is needed in GitHub Actions.
"""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# ── Set env vars BEFORE importing Config or create_app ───────────────────────
# Config and encryption.py read these at import/call time.
# ENCRYPTION_KEY must be a valid 32-byte URL-safe base64 Fernet key.
os.environ.setdefault('ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
os.environ.setdefault('SECRET_KEY', 'ci-test-secret')
os.environ.setdefault('JWT_SECRET_KEY', 'ci-test-jwt-secret')

from config import Config  # noqa: E402
Config.SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'


@pytest.fixture
def client():
    from app import create_app
    app = create_app()
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    with app.test_client() as c:
        yield c


# ── Health check ──────────────────────────────────────────────────────────────

def test_health_check(client):
    """GET /health must return 200 and {"status": "ok"}."""
    response = client.get('/health')
    assert response.status_code == 200
    assert response.get_json()['status'] == 'ok'


# ── Auth ──────────────────────────────────────────────────────────────────────

def test_login_missing_fields(client):
    """POST /api/auth/login with empty body must return 400 or 401."""
    response = client.post('/api/auth/login', json={})
    assert response.status_code in [400, 401]


def test_login_wrong_credentials(client):
    """POST /api/auth/login with bad credentials must return 401."""
    response = client.post('/api/auth/login', json={
        'username': 'nonexistent',
        'password': 'wrongpassword'
    })
    assert response.status_code == 401


def test_login_returns_json(client):
    """POST /api/auth/login must always return JSON, not HTML."""
    response = client.post('/api/auth/login', json={
        'username': 'test',
        'password': 'test'
    })
    assert response.content_type == 'application/json'


# ── Static frontend ───────────────────────────────────────────────────────────

def test_root_serves_login_page(client):
    """GET / must serve login.html with status 200."""
    response = client.get('/')
    assert response.status_code == 200


# ── Authenticated routes blocked without token ────────────────────────────────

def test_passwords_requires_auth(client):
    """GET /api/passwords/ without token must return 401 or 422."""
    response = client.get('/api/passwords/')
    assert response.status_code in [401, 422]


def test_admin_requires_auth(client):
    """GET /api/admin/users without token must return 401 or 422."""
    response = client.get('/api/admin/users')
    assert response.status_code in [401, 422]
