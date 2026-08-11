"""
TaskForge Search Service — FastAPI application with pgvector semantic search and AI features.
Uses sentence-transformers/all-MiniLM-L6-v2 for local embeddings (no API keys required).
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

from database import Database
from embeddings import EmbeddingModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

db = Database()
embedding_model = EmbeddingModel()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: connect to DB, load embedding model."""
    await db.connect()
    if os.getenv("AUTO_MIGRATE", "true").lower() != "false":
        await db.create_tables()
        logger.info("Migrations applied (search schema)")
    else:
        logger.info("Skipping migrations (AUTO_MIGRATE=false)")
    embedding_model.load()
    logger.info("Search service ready")
    yield
    await db.disconnect()


app = FastAPI(title="TaskForge Search Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Health Check ----

@app.get("/health")
async def health():
    return {"status": "ok"}


# ---- Internal: Index Issue ----

class IndexRequest(BaseModel):
    issue_id: str
    title: str
    description: str = ""
    project_id: str


@app.post("/internal/index")
async def index_issue(req: IndexRequest):
    """Upsert an issue's embedding (title + description) into pgvector."""
    text = f"{req.title} {req.description}".strip()
    embedding = embedding_model.encode(text)

    await db.upsert_issue_embedding(
        issue_id=req.issue_id,
        project_id=req.project_id,
        title=req.title,
        description=req.description,
        embedding=embedding,
    )

    return {"status": "indexed", "issue_id": req.issue_id}


# ---- Search ----

@app.get("/api/search")
async def search(
    q: str = Query(..., description="Search query"),
    project_id: Optional[str] = Query(None, description="Filter by project"),
    limit: int = Query(20, description="Max results"),
):
    """Cosine-similarity search over indexed issues."""
    query_embedding = embedding_model.encode(q)
    results = await db.search_issues(
        query_embedding=query_embedding,
        project_id=project_id,
        limit=limit,
    )
    return results


# ---- AI: Suggest Labels ----

class SuggestLabelsRequest(BaseModel):
    title: str
    description: str = ""
    project_id: str


@app.post("/api/ai/suggest-labels")
async def suggest_labels(req: SuggestLabelsRequest):
    """Embedding similarity against the project's existing labels."""
    text = f"{req.title} {req.description}".strip()
    query_embedding = embedding_model.encode(text)

    labels = await db.get_project_labels(req.project_id)
    if not labels:
        return {"suggestions": []}

    # Compute similarity between issue text and each label name
    scored_labels = []
    for label in labels:
        label_embedding = embedding_model.encode(label["name"])
        similarity = embedding_model.cosine_similarity(query_embedding, label_embedding)
        scored_labels.append({**label, "score": float(similarity)})

    scored_labels.sort(key=lambda x: x["score"], reverse=True)
    return {"suggestions": scored_labels[:5]}


# ---- AI: Duplicate Check ----

class DuplicateCheckRequest(BaseModel):
    title: str
    description: str = ""
    project_id: str
    threshold: float = 0.7


@app.post("/api/ai/duplicate-check")
async def duplicate_check(req: DuplicateCheckRequest):
    """Embedding similarity against existing issues, return top matches above threshold."""
    text = f"{req.title} {req.description}".strip()
    query_embedding = embedding_model.encode(text)

    results = await db.search_issues(
        query_embedding=query_embedding,
        project_id=req.project_id,
        limit=5,
    )

    duplicates = [r for r in results if r.get("similarity", 0) >= req.threshold]

    return {
        "is_duplicate": len(duplicates) > 0,
        "matches": duplicates,
    }


# ---- AI: Summarize Comments ----

class SummarizeCommentsRequest(BaseModel):
    issue_id: str
    comments: List[dict] = []


@app.post("/api/ai/summarize-comments")
async def summarize_comments(req: SummarizeCommentsRequest):
    """
    Summarize a comment thread. Uses a simple extractive approach
    for Phase 1 (no external LLM API key required). In Phase 2,
    this would call an LLM for abstractive summarization.
    """
    comments = req.comments
    if not comments:
        return {"summary": "No comments to summarize."}

    # Simple extractive summary: pick the most information-dense comments
    # by length and recency
    sorted_comments = sorted(comments, key=lambda c: len(c.get("body", "")), reverse=True)

    # Take top 3 most substantial comments
    key_comments = sorted_comments[:3]
    key_comments.sort(key=lambda c: c.get("created_at", ""))

    summary_parts = []
    for i, comment in enumerate(key_comments):
        body = comment.get("body", "").strip()
        author = comment.get("author_id", "Unknown")
        if len(body) > 200:
            body = body[:200] + "..."
        summary_parts.append(f"• {body}")

    summary = f"Thread summary ({len(comments)} comments):\n" + "\n".join(summary_parts)

    return {"summary": summary, "comment_count": len(comments)}
