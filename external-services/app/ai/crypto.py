"""
AES-256-GCM encryption utility for TaskForge Services Platform.

Used exclusively for encrypting third-party API keys (OpenAI, Anthropic, etc.)
before storing them in the database.

Security properties:
  - AES-256-GCM: authenticated encryption — detects tampering via auth tag
  - Random 12-byte nonce per encryption — same plaintext → different ciphertext each time
  - SECRET_KEY never leaves the server; encrypted blob in DB is useless without it
  - Raw API key is NEVER stored, logged, or returned to HTTP clients

Key rotation:
  If SECRET_KEY is rotated, re-encrypt all rows in search.project_api_keys.
  Back up SECRET_KEY safely — losing it means all stored keys are unrecoverable.
"""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings


def _get_key() -> bytes:
    """Load and validate SECRET_KEY from settings."""
    raw = get_settings().secret_key
    if not raw:
        raise RuntimeError(
            "SECRET_KEY environment variable is not set. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    try:
        key = bytes.fromhex(raw)
    except ValueError:
        raise RuntimeError("SECRET_KEY must be a valid hex string (64 hex characters for AES-256)")
    if len(key) != 32:
        raise RuntimeError(
            f"SECRET_KEY must decode to exactly 32 bytes (got {len(key)}). "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    return key


def encrypt_api_key(plaintext: str) -> str:
    """
    Encrypt a plaintext API key for safe storage in the database.

    Returns base64(nonce || ciphertext || auth_tag) — safe to store as TEXT.
    The nonce is 12 random bytes, unique per call.
    """
    if not plaintext:
        raise ValueError("Cannot encrypt an empty API key")

    key = _get_key()
    nonce = os.urandom(12)  # 96-bit nonce — NIST recommended for GCM
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    # ciphertext already includes the 16-byte GCM authentication tag
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt_api_key(token: str) -> str:
    """
    Decrypt a value previously produced by encrypt_api_key().

    The decrypted plaintext is used ONLY in-process (for LLM calls).
    It must NEVER be returned in HTTP responses or logged.
    """
    if not token:
        raise ValueError("Cannot decrypt an empty token")

    key = _get_key()
    raw = base64.b64decode(token)
    nonce, ciphertext = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    # Raises cryptography.exceptions.InvalidTag if tampered with
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")
