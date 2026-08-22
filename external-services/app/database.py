"""
Database layer for the TaskForge Services Platform.
Uses asyncpg with pgvector for semantic search.
Schema: 'search' (isolated from core/auth schemas on shared Supabase DB).
"""

import logging
from typing import Optional

import asyncpg

from app.config import get_settings

logger = logging.getLogger(__name__)


class Database:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        settings = get_settings()
        db_url = settings.database_url
        if not db_url:
            logger.error("DATABASE_URL is not set!")
            return

        import re
        ssl_mode = None
        if any(term in db_url for term in ["sslmode=require", "ssl=require", "supabase", "pooler"]):
            ssl_mode = "require"
            # Strip query parameters unsupported by asyncpg in DSN
            db_url = re.sub(r"\?(sslmode|search_path|ssl)=[^&]*&?", "?", db_url)
            db_url = re.sub(r"&(sslmode|search_path|ssl)=[^&]*", "", db_url).rstrip("?")

        pool_kwargs = {
            "min_size": 2,
            "max_size": 10,
            "server_settings": {"search_path": "search"},
        }
        if ssl_mode:
            pool_kwargs["ssl"] = ssl_mode

        self.pool = await asyncpg.create_pool(db_url, **pool_kwargs)
        async with self.pool.acquire() as conn:
            await conn.execute("CREATE SCHEMA IF NOT EXISTS search")
            await conn.execute("SET search_path TO search")
        logger.info("Connected to database (schema: search)")

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    async def migrate(self):
        """Create all tables for the services platform."""
        async with self.pool.acquire() as conn:
            # ---- pgvector extension ----
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")

            # ---- Issue embeddings (semantic search) ----
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS search.issue_embeddings (
                    issue_id    TEXT PRIMARY KEY,
                    project_id  TEXT NOT NULL,
                    title       TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    embedding   vector(384),
                    updated_at  TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            # IVFFlat index for cosine similarity (created only when table exists)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_issue_embeddings_vector
                ON search.issue_embeddings
                USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 10)
            """)

            # ---- Project AI API keys (AES-256-GCM encrypted, never raw) ----
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS search.project_api_keys (
                    project_id    TEXT PRIMARY KEY,
                    provider      TEXT NOT NULL,
                    encrypted_key TEXT NOT NULL,
                    updated_at    TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            # ---- OTP tokens (Phase 2 — pre-created, not yet active) ----
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS search.otp_tokens (
                    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id    TEXT NOT NULL,
                    code_hash  TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    used       BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)

        logger.info("Database migration complete (services schema)")

    # ---- Issue Embeddings ----

    async def upsert_issue_embedding(
        self,
        issue_id: str,
        project_id: str,
        title: str,
        description: str,
        embedding: Optional[list] = None,
    ):
        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]" if embedding else None
        async with self.pool.acquire() as conn:
            if embedding_str:
                await conn.execute(
                    """
                    INSERT INTO search.issue_embeddings
                        (issue_id, project_id, title, description, embedding, updated_at)
                    VALUES ($1, $2, $3, $4, $5::vector, NOW())
                    ON CONFLICT (issue_id) DO UPDATE SET
                        title       = EXCLUDED.title,
                        description = EXCLUDED.description,
                        embedding   = EXCLUDED.embedding,
                        updated_at  = NOW()
                    """,
                    issue_id, project_id, title, description, embedding_str,
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO search.issue_embeddings
                        (issue_id, project_id, title, description, updated_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (issue_id) DO UPDATE SET
                        title       = EXCLUDED.title,
                        description = EXCLUDED.description,
                        updated_at  = NOW()
                    """,
                    issue_id, project_id, title, description,
                )

    async def search_issues(
        self,
        query_embedding: Optional[list] = None,
        project_id: Optional[str] = None,
        limit: int = 20,
    ) -> list:
        async with self.pool.acquire() as conn:
            if query_embedding:
                embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
                if project_id:
                    rows = await conn.fetch(
                        """
                        SELECT issue_id, project_id, title, description,
                               1 - (embedding <=> $1::vector) AS similarity
                        FROM search.issue_embeddings
                        WHERE project_id = $2 AND embedding IS NOT NULL
                        ORDER BY embedding <=> $1::vector
                        LIMIT $3
                        """,
                        embedding_str, project_id, limit,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT issue_id, project_id, title, description,
                               1 - (embedding <=> $1::vector) AS similarity
                        FROM search.issue_embeddings
                        WHERE embedding IS NOT NULL
                        ORDER BY embedding <=> $1::vector
                        LIMIT $2
                        """,
                        embedding_str, limit,
                    )
                return [
                    {
                        "issue_id": row["issue_id"],
                        "project_id": row["project_id"],
                        "title": row["title"],
                        "description": row["description"],
                        "similarity": float(row["similarity"]) if row["similarity"] is not None else 0.0,
                    }
                    for row in rows
                ]
            else:
                # Standard non-vector query
                if project_id:
                    rows = await conn.fetch(
                        """
                        SELECT issue_id, project_id, title, description
                        FROM search.issue_embeddings
                        WHERE project_id = $1
                        ORDER BY updated_at DESC
                        LIMIT $2
                        """,
                        project_id, limit,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT issue_id, project_id, title, description
                        FROM search.issue_embeddings
                        ORDER BY updated_at DESC
                        LIMIT $1
                        """,
                        limit,
                    )
                return [
                    {
                        "issue_id": row["issue_id"],
                        "project_id": row["project_id"],
                        "title": row["title"],
                        "description": row["description"],
                        "similarity": 1.0,
                    }
                    for row in rows
                ]

    async def delete_issue_embedding(self, issue_id: str):
        if not self.pool:
            return
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM search.issue_embeddings WHERE issue_id = $1",
                issue_id,
            )

    # ---- Project API Keys ----

    async def get_project_api_key(self, project_id: str) -> Optional[dict]:
        if not self.pool:
            return None
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT project_id, provider, encrypted_key, updated_at "
                "FROM search.project_api_keys WHERE project_id = $1",
                project_id,
            )
        if not row:
            return None
        return dict(row)

    async def upsert_project_api_key(
        self, project_id: str, provider: str, encrypted_key: str
    ):
        if not self.pool:
            return
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO search.project_api_keys
                    (project_id, provider, encrypted_key, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (project_id) DO UPDATE SET
                    provider      = EXCLUDED.provider,
                    encrypted_key = EXCLUDED.encrypted_key,
                    updated_at    = NOW()
                """,
                project_id, provider, encrypted_key,
            )

    async def delete_project_api_key(self, project_id: str):
        if not self.pool:
            return
        async with self.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM search.project_api_keys WHERE project_id = $1",
                project_id,
            )

    async def project_has_api_key(self, project_id: str) -> bool:
        if not self.pool:
            return False
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT 1 FROM search.project_api_keys WHERE project_id = $1",
                project_id,
            )
        return row is not None
