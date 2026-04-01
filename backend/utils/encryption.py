import os
import base64
from cryptography.fernet import Fernet


def get_fernet():
    key = os.getenv('ENCRYPTION_KEY')
    if not key:
        raise RuntimeError("ENCRYPTION_KEY not set in environment variables.")
    return Fernet(key.encode() if isinstance(key, str) else key)


def generate_key():
    """Run once to generate a key, save it to .env as ENCRYPTION_KEY."""
    return Fernet.generate_key().decode()


def encrypt_password(plain_text: str) -> str:
    f = get_fernet()
    return f.encrypt(plain_text.encode()).decode()


def decrypt_password(cipher_text: str) -> str:
    f = get_fernet()
    return f.decrypt(cipher_text.encode()).decode()
