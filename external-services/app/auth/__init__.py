"""
JWKS-based JWT authentication dependency for FastAPI (SEC-03 fix).

Provides require_internal_auth() — a FastAPI dependency that validates the
Authorization: Bearer <token> header against the JWKS endpoint of auth-service.
Keys are cached in-process for 5 minutes to avoid per-request JWKS fetches.

Usage:
    from app.auth.jwks_auth import require_internal_auth

    @router.post("/some-endpoint")
    async def my_endpoint(
        req: MyRequest,
        _: None = Depends(require_internal_auth),
    ):
        ...
"""

import base64
import hashlib
import json
import logging
import os
import time
from typing import Optional

import httpx
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# In-process JWKS cache
# ---------------------------------------------------------------------------

_jwks_cache: dict = {}          # kid -> RSAPublicKey
_jwks_fetched_at: float = 0.0   # epoch seconds
_JWKS_TTL = 300                 # 5 minutes


def _b64url_decode(s: str) -> bytes:
    """Base64url decode with padding."""
    padding_needed = (4 - len(s) % 4) % 4
    return base64.urlsafe_b64decode(s + "=" * padding_needed)


def _build_rsa_public_key(n_b64: str, e_b64: str) -> RSAPublicKey:
    """Construct an RSA public key from JWK n/e base64url values."""
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers

    n = int.from_bytes(_b64url_decode(n_b64), "big")
    e = int.from_bytes(_b64url_decode(e_b64), "big")
    return RSAPublicNumbers(e, n).public_key(default_backend())


async def _get_public_key(kid: str) -> Optional[RSAPublicKey]:
    """Return the RSA public key for a given kid, refreshing the JWKS cache as needed."""
    global _jwks_cache, _jwks_fetched_at

    now = time.monotonic()
    if now - _jwks_fetched_at < _JWKS_TTL and (_jwks_cache or kid == ""):
        key = _jwks_cache.get(kid) or (next(iter(_jwks_cache.values()), None) if kid == "" else None)
        if key:
            return key

    # Fetch fresh JWKS
    jwks_url = os.getenv("JWKS_URL", "http://auth-service:8080/.well-known/jwks.json")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(jwks_url)
            resp.raise_for_status()
            jwks = resp.json()
    except Exception as exc:
        logger.warning("Failed to fetch JWKS from %s: %s", jwks_url, exc)
        # Return stale key if available
        return _jwks_cache.get(kid) or next(iter(_jwks_cache.values()), None)

    new_cache: dict = {}
    for jwk in jwks.get("keys", []):
        if jwk.get("kty") != "RSA":
            continue
        try:
            pub_key = _build_rsa_public_key(jwk["n"], jwk["e"])
            new_cache[jwk.get("kid", "")] = pub_key
        except Exception as exc:
            logger.warning("Failed to parse JWK: %s", exc)

    _jwks_cache = new_cache
    _jwks_fetched_at = now

    return _jwks_cache.get(kid) or next(iter(_jwks_cache.values()), None)


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

async def require_internal_auth(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict:
    """
    FastAPI dependency — validates the Bearer JWT against JWKS.
    Returns the decoded claims dict on success, raises HTTP 401 on failure.

    SEC-03 fix: attach this dependency to write endpoints on external-services
    so only authenticated callers (core-service forwarding a user token) can call them.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = credentials.credentials
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid token format")

    header_raw = _b64url_decode(parts[0])
    try:
        header = json.loads(header_raw)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token header")

    if header.get("alg") != "RS256":
        raise HTTPException(status_code=401, detail="Unsupported token algorithm")

    kid = header.get("kid", "")
    pub_key = await _get_public_key(kid)
    if pub_key is None:
        raise HTTPException(status_code=401, detail="Unable to resolve signing key")

    # Verify RS256 signature
    signing_input = f"{parts[0]}.{parts[1]}".encode()
    signature = _b64url_decode(parts[2])
    try:
        pub_key.verify(signature, signing_input, padding.PKCS1v15(), hashes.SHA256())
    except Exception:
        raise HTTPException(status_code=401, detail="Token signature verification failed")

    # Decode and validate claims
    payload_raw = _b64url_decode(parts[1])
    try:
        claims = json.loads(payload_raw)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    import time as _time
    if claims.get("exp", 0) < _time.time():
        raise HTTPException(status_code=401, detail="Token has expired")

    # Reject refresh tokens used on non-auth endpoints (consistent with SEC-05 Go fix)
    if claims.get("token_type") == "refresh":
        raise HTTPException(status_code=401, detail="Refresh tokens cannot be used here")

    return claims
