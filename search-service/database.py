"""
Database layer for search-service using asyncpg with pgvector.
Stores issue embeddings for semantic search.
"""

import os
import asyncpg
import json
import logging
from typing import Optional, List

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://taskforge:taskforge_secret@localhost:5432/taskforge_search"
)


class Database:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        logger.info("Connected to database")

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    async def create_tables(self):
        async with self.pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS issue_embeddings (
                    issue_id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    embedding vector(384),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS labels (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    color TEXT DEFAULT '#6366f1'
                )
            """)

            # Create index for cosine similarity search
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_issue_embeddings_vector
                ON issue_embeddings USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 10)
            """)

        logger.info("Database tables created")

    async def upsert_issue_embedding(
        self, issue_id: str, project_id: str, title: str, description: str, embedding: list
    ):
        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
        async with self.pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO issue_embeddings (issue_id, project_id, title, description, embedding, updated_at)
                VALUES ($1, $2, $3, $4, $5::vector, NOW())
                ON CONFLICT (issue_id)
                DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    embedding = EXCLUDED.embedding,
                    updated_at = NOW()
            """, issue_id, project_id, title, description, embedding_str)

    async def search_issues(
        self, query_embedding: list, project_id: Optional[str] = None, limit: int = 20
    ) -> list:
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

        async with self.pool.acquire() as conn:
            if project_id:
                rows = await conn.fetch("""
                    SELECT issue_id, project_id, title, description,
                           1 - (embedding <=> $1::vector) as similarity
                    FROM issue_embeddings
                    WHERE project_id = $2
                    ORDER BY embedding <=> $1::vector
                    LIMIT $3
                """, embedding_str, project_id, limit)
            else:
                rows = await conn.fetch("""
                    SELECT issue_id, project_id, title, description,
                           1 - (embedding <=> $1::vector) as similarity
                    FROM issue_embeddings
                    ORDER BY embedding <=> $1::vector
                    LIMIT $2
                """, embedding_str, limit)

        return [
            {
                "issue_id": row["issue_id"],
                "project_id": row["project_id"],
                "title": row["title"],
                "description": row["description"],
                "similarity": float(row["similarity"]),
            }
            for row in rows
        ]

    async def get_project_labels(self, project_id: str) -> list:
        """
        Get labels for a project. These are fetched from the core-service's database
        perspective — in Phase 1 we sync them via the index call. For simplicity,
        we return a basic list from our local labels table.
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, name, color FROM labels WHERE project_id = $1",
                project_id,
            )
        return [{"id": row["id"], "name": row["name"], "color": row["color"]} for row in rows]
