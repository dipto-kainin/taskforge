# SEC-03: JWKS authentication dependency for external-services.
# See __init__.py for full implementation and usage docs.
from app.auth import require_internal_auth

__all__ = ["require_internal_auth"]
