"""
Project API key management — CRUD for encrypted LLM API keys.

Keys are AES-256-GCM encrypted before DB insert (see crypto.py).
The raw API key is NEVER stored, logged, or returned to HTTP clients.
"""

import logging
from typing import Optional

from app.ai.crypto import decrypt_api_key, encrypt_api_key
from app.database import Database

logger = logging.getLogger(__name__)


class ProjectKeyService:
    def __init__(self, db: Database):
        self.db = db

    async def set_key(self, project_id: str, provider: str, raw_api_key: str):
        """Encrypt and store (or overwrite) the API key for a project."""
        provider = provider.lower().strip()
        if provider not in ("openai", "anthropic", "google"):
            raise ValueError(f"Unsupported provider: {provider}. Must be openai, anthropic, or google.")

        encrypted = encrypt_api_key(raw_api_key)
        await self.db.upsert_project_api_key(project_id, provider, encrypted)
        logger.info(f"API key set for project {project_id} (provider: {provider})")

    async def get_decrypted_key(self, project_id: str) -> Optional[dict]:
        """
        Retrieve and decrypt the API key for internal use ONLY.
        Returns {"provider": str, "api_key": str} or None.
        The decrypted api_key must never be sent to HTTP clients.
        """
        row = await self.db.get_project_api_key(project_id)
        if not row:
            return None
        return {
            "provider": row["provider"],
            "api_key": decrypt_api_key(row["encrypted_key"]),
        }

    async def remove_key(self, project_id: str):
        """Delete the stored API key for a project."""
        await self.db.delete_project_api_key(project_id)
        logger.info(f"API key removed for project {project_id}")

    async def has_key(self, project_id: str) -> bool:
        """Check if a project has a configured API key (safe for frontend)."""
        return await self.db.project_has_api_key(project_id)
