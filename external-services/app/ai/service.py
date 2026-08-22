"""
AI service — 100% LLM API powered (OpenAI, Anthropic, Google Gemini).

Requires an encrypted project API key in DB (configured by project owner/admin).
No local fallback — returns clear 400 error if no API key is configured.
"""

import logging
from typing import Optional

from fastapi import HTTPException
from app.ai.project_keys import ProjectKeyService
from app.database import Database

logger = logging.getLogger(__name__)


class AIService:
    def __init__(self, db: Database, key_service: ProjectKeyService):
        self.db = db
        self.key_service = key_service

    async def _require_key(self, project_id: Optional[str]) -> dict:
        if not project_id:
            raise HTTPException(
                status_code=400,
                detail="Project ID is required for AI features."
            )
        key_info = await self.key_service.get_decrypted_key(project_id)
        if not key_info:
            raise HTTPException(
                status_code=400,
                detail="No AI API key configured for this project. Please add an LLM API key in Project Settings."
            )
        return key_info

    async def ai_search(
        self,
        query: str,
        project_id: Optional[str],
        limit: int = 20,
    ) -> list:
        """
        Perform AI-enhanced semantic search via LLM provider.
        Requires project API key. Returns vector search results from pgvector.
        """
        key_info = await self._require_key(project_id)
        embedding = await self.generate_embedding(query, key_info)

        return await self.db.search_issues(
            query_embedding=embedding,
            project_id=project_id,
            limit=limit,
        )

    async def generate_embedding(self, text: str, key_info: dict) -> list:
        """Generate embedding vector using the configured LLM provider."""
        provider = key_info["provider"]
        api_key = key_info["api_key"]

        try:
            if provider == "openai":
                from langchain_openai import OpenAIEmbeddings
                embedder = OpenAIEmbeddings(api_key=api_key, model="text-embedding-3-small")
                return await embedder.aembed_query(text)

            elif provider == "google":
                from langchain_google_genai import GoogleGenerativeAIEmbeddings
                embedder = GoogleGenerativeAIEmbeddings(
                    google_api_key=api_key, model="models/text-embedding-004"
                )
                return await embedder.aembed_query(text)

            elif provider == "anthropic":
                # Anthropic does not offer an embedding API — use Claude to generate keywords, then search
                from langchain_anthropic import ChatAnthropic
                llm = ChatAnthropic(api_key=api_key, model="claude-3-haiku-20240307", temperature=0)
                res = await llm.ainvoke(f"Extract 3-5 search keywords from: {text}")
                # For Anthropic projects, return empty vector (fallback to text search)
                raise HTTPException(
                    status_code=400,
                    detail="Anthropic does not provide an embedding API. Please select OpenAI or Google Gemini for vector search."
                )
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"LLM embedding failed ({provider}): {e}")
            raise HTTPException(status_code=502, detail=f"AI provider embedding error: {str(e)}")

    async def suggest_labels(self, title: str, description: str, project_id: str) -> list:
        """Suggest labels using LLM."""
        key_info = await self._require_key(project_id)
        provider = key_info["provider"]
        api_key = key_info["api_key"]

        # Fetch labels from core-service
        import httpx
        from app.config import get_settings
        settings = get_settings()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{settings.core_service_url}/api/projects/{project_id}/labels"
                )
                labels = resp.json() if resp.status_code == 200 else []
        except Exception:
            labels = []

        if not labels:
            return []

        label_names = [l.get("name", "") for l in labels]
        prompt = (
            f"Given the issue title '{title}' and description '{description}', "
            f"which of these existing labels fit best? Options: {', '.join(label_names)}. "
            f"Return only a comma-separated list of matching label names."
        )

        try:
            if provider == "openai":
                from langchain_openai import ChatOpenAI
                llm = ChatOpenAI(api_key=api_key, model="gpt-4o-mini", temperature=0)
            elif provider == "anthropic":
                from langchain_anthropic import ChatAnthropic
                llm = ChatAnthropic(api_key=api_key, model="claude-3-haiku-20240307", temperature=0)
            elif provider == "google":
                from langchain_google_genai import ChatGoogleGenerativeAI
                llm = ChatGoogleGenerativeAI(google_api_key=api_key, model="gemini-1.5-flash", temperature=0)
            else:
                return []

            res = await llm.ainvoke(prompt)
            matched_names = [s.strip().lower() for s in res.content.split(",")]
            return [l for l in labels if l.get("name", "").lower() in matched_names]
        except Exception as e:
            logger.error(f"LLM label suggestion failed: {e}")
            raise HTTPException(status_code=502, detail=f"LLM error: {str(e)}")

    async def duplicate_check(
        self, title: str, description: str, project_id: str, threshold: float = 0.7
    ) -> dict:
        """Check if a new issue is potentially a duplicate using LLM vector search."""
        key_info = await self._require_key(project_id)
        text = f"{title} {description}".strip()
        embedding = await self.generate_embedding(text, key_info)
        results = await self.db.search_issues(embedding, project_id, limit=5)
        duplicates = [r for r in results if r.get("similarity", 0) >= threshold]
        return {"is_duplicate": len(duplicates) > 0, "matches": duplicates}

    async def summarize_comments(self, issue_id: str, comments: list, project_id: Optional[str] = None) -> dict:
        """Summarize a comment thread using LLM."""
        if not comments:
            return {"summary": "No comments to summarize.", "comment_count": 0}

        key_info = await self._require_key(project_id)
        provider = key_info["provider"]
        api_key = key_info["api_key"]

        comment_text = "\n".join(
            f"- {c.get('body', '').strip()}" for c in comments if c.get("body")
        )
        prompt = (
            f"Summarize the following comment thread from a project management tool "
            f"in 2-3 concise sentences:\n\n{comment_text}"
        )

        try:
            if provider == "openai":
                from langchain_openai import ChatOpenAI
                llm = ChatOpenAI(api_key=api_key, model="gpt-4o-mini", temperature=0)
            elif provider == "anthropic":
                from langchain_anthropic import ChatAnthropic
                llm = ChatAnthropic(api_key=api_key, model="claude-3-haiku-20240307", temperature=0)
            elif provider == "google":
                from langchain_google_genai import ChatGoogleGenerativeAI
                llm = ChatGoogleGenerativeAI(google_api_key=api_key, model="gemini-1.5-flash", temperature=0)
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

            result = await llm.ainvoke(prompt)
            return {"summary": result.content.strip(), "comment_count": len(comments)}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"LLM summarize failed: {e}")
            raise HTTPException(status_code=502, detail=f"LLM error: {str(e)}")
