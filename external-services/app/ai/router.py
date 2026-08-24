"""
AI router — LLM-powered endpoints and project API key management.

Endpoints:
  POST /api/ai/project-key          — set encrypted API key (owners/admins only)
  DELETE /api/ai/project-key/{id}   — remove key
  GET /api/ai/project-key/{id}/exists — check key presence (safe for frontend)

  POST /api/ai/suggest-labels       — LLM label suggestions
  POST /api/ai/duplicate-check      — LLM duplicate issue detection
  POST /api/ai/summarize-comments   — LLM comment thread summary
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.ai.project_keys import ProjectKeyService
from app.ai.service import AIService
from app.auth.jwks_auth import require_internal_auth
from app.database import Database

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai"])


# ---- Dependency helpers ----

def get_db(request: Request) -> Database:
    return request.app.state.db

def get_key_service(request: Request) -> ProjectKeyService:
    return request.app.state.key_service

def get_ai_service(request: Request) -> AIService:
    return request.app.state.ai_service


# ---- Project API Key Management ----

class SetKeyRequest(BaseModel):
    project_id: str
    provider: str   # openai | anthropic | google
    api_key: str    # raw key — encrypted before DB write, never stored plain


@router.post("/project-key", status_code=201)
async def set_project_api_key(
    req: SetKeyRequest,
    key_service: ProjectKeyService = Depends(get_key_service),
    _claims: dict = Depends(require_internal_auth),  # SEC-03: auth required
):
    """Store an encrypted LLM API key for a project. Raw key never reaches the DB."""
    try:
        await key_service.set_key(req.project_id, req.provider, req.api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "ok", "project_id": req.project_id, "provider": req.provider}


@router.delete("/project-key/{project_id}", status_code=200)
async def remove_project_api_key(
    project_id: str,
    key_service: ProjectKeyService = Depends(get_key_service),
    _claims: dict = Depends(require_internal_auth),  # SEC-03: auth required
):
    """Remove the LLM API key for a project."""
    await key_service.remove_key(project_id)
    return {"status": "removed"}


@router.get("/project-key/{project_id}/exists")
async def project_key_exists(
    project_id: str,
    key_service: ProjectKeyService = Depends(get_key_service),
):
    """
    Returns whether a project has a configured API key.
    Safe for frontend — no key value is ever returned.
    """
    has_key = await key_service.has_key(project_id)
    return {"project_id": project_id, "has_key": has_key}


# ---- AI Features ----

class SuggestLabelsRequest(BaseModel):
    title: str
    description: str = ""
    project_id: str


@router.post("/suggest-labels")
async def suggest_labels(
    req: SuggestLabelsRequest,
    ai_service: AIService = Depends(get_ai_service),
):
    suggestions = await ai_service.suggest_labels(
        req.title, req.description, req.project_id
    )
    return {"suggestions": suggestions}


class DuplicateCheckRequest(BaseModel):
    title: str
    description: str = ""
    project_id: str
    threshold: float = 0.7


@router.post("/duplicate-check")
async def duplicate_check(
    req: DuplicateCheckRequest,
    ai_service: AIService = Depends(get_ai_service),
):
    result = await ai_service.duplicate_check(
        req.title, req.description, req.project_id, req.threshold
    )
    return result


class CommentInput(BaseModel):
    id: Optional[str] = None
    author_id: Optional[str] = None
    body: str = ""
    created_at: Optional[str] = None


class SummarizeCommentsRequest(BaseModel):
    issue_id: str
    project_id: Optional[str] = None
    comments: List[CommentInput] = []


@router.post("/summarize-comments")
async def summarize_comments(
    req: SummarizeCommentsRequest,
    ai_service: AIService = Depends(get_ai_service),
):
    comments_dicts = [c.model_dump() for c in req.comments]
    result = await ai_service.summarize_comments(
        req.issue_id, comments_dicts, req.project_id
    )
    return result
