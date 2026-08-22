"""
Search router — AI search + internal indexing endpoint.

Endpoints:
  GET  /api/search            — issue search (use_ai=true uses project LLM API key)
  POST /internal/index        — index issue (embeds via LLM if API key is set)
  DELETE /internal/index/{id} — remove indexed issue
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app.ai.project_keys import ProjectKeyService
from app.database import Database

logger = logging.getLogger(__name__)
router = APIRouter(tags=["search"])


def get_db(request: Request) -> Database:
    return request.app.state.db

def get_ai_service(request: Request):
    return request.app.state.ai_service

def get_key_service(request: Request) -> ProjectKeyService:
    return request.app.state.key_service


# ---- Search ----

@router.get("/api/search")
async def search(
    q: str = Query(..., description="Search query"),
    project_id: Optional[str] = Query(None, description="Filter by project"),
    limit: int = Query(20, le=100),
    use_ai: bool = Query(False, description="Use LLM-enhanced AI search"),
    request: Request = None,
):
    """
    Search issues.
    Set use_ai=true to perform LLM vector search.
    Requires a configured LLM API key for the project — returns HTTP 400 if missing.
    """
    ai_service = get_ai_service(request)
    if use_ai:
        if not project_id:
            raise HTTPException(
                status_code=400,
                detail="project_id is required when use_ai=true"
            )
        return await ai_service.ai_search(q, project_id, limit)

    # Standard search: query issues from DB if vector exists or exact text match
    db: Database = get_db(request)
    return await db.search_issues(query_embedding=None, project_id=project_id, limit=limit)


# ---- Internal: Index Issue ----

class IndexRequest(BaseModel):
    issue_id: str
    title: str
    description: str = ""
    project_id: str


@router.post("/internal/index", status_code=200)
async def index_issue(req: IndexRequest, request: Request):
    """
    Upsert issue into search table.
    If the project has an LLM API key configured, generates vector embedding via LLM.
    If no API key is set, saves title/description for future vector generation.
    """
    key_service: ProjectKeyService = get_key_service(request)
    ai_service = get_ai_service(request)
    db: Database = get_db(request)

    key_info = await key_service.get_decrypted_key(req.project_id)
    embedding = None

    if key_info:
        try:
            text = f"{req.title} {req.description}".strip()
            embedding = await ai_service.generate_embedding(text, key_info)
        except Exception as e:
            logger.warning(f"Failed to generate LLM embedding for issue {req.issue_id}: {e}")

    await db.upsert_issue_embedding(
        req.issue_id, req.project_id, req.title, req.description, embedding
    )
    return {"status": "indexed", "issue_id": req.issue_id, "has_vector": embedding is not None}


@router.delete("/internal/index/{issue_id}", status_code=200)
async def remove_index(issue_id: str, request: Request):
    """Remove an issue from the search index."""
    db: Database = get_db(request)
    await db.delete_issue_embedding(issue_id)
    return {"status": "removed", "issue_id": issue_id}
