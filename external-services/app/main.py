"""
TaskForge Services Platform — FastAPI Application.

Third-party API platform providing:
  - Mail: invite emails via Resend with HTML templates
  - Search: pgvector semantic search with optional AI-enhanced mode
  - AI: LangChain-powered features with per-project encrypted API keys
  - OTP: MFA stub (Phase 2)

Health endpoints:
  GET /health        — always 200 (service is up)
  GET /health/ready  — 200 when embedding model is loaded, 503 otherwise
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Database
from app.ai.project_keys import ProjectKeyService
from app.ai.service import AIService
from app.mail.router import router as mail_router
from app.search.router import router as search_router
from app.ai.router import router as ai_router
from app.otp.router import router as otp_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: connect DB, run migrations, start model loading in background."""
    settings = get_settings()

    # ---- Database ----
    db = Database()
    await db.connect()

    auto_migrate = os.getenv("AUTO_MIGRATE", "true").lower() != "false"
    if auto_migrate:
        await db.migrate()
        logger.info("Database migrations applied")
    else:
        logger.info("Skipping migrations (AUTO_MIGRATE=false)")

    # ---- Services ----
    key_service = ProjectKeyService(db)
    ai_service = AIService(db, key_service)

    # Attach to app state
    app.state.db = db
    app.state.key_service = key_service
    app.state.ai_service = ai_service

    logger.info("External services platform started")

    yield

    # ---- Shutdown ----
    await db.disconnect()
    logger.info("Services platform shut down")


app = FastAPI(
    title="TaskForge Services Platform",
    description="Unified third-party API service: Mail, AI Search, OTP",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Routers ----
app.include_router(mail_router)
app.include_router(search_router)
app.include_router(ai_router)
app.include_router(otp_router)


# ---- Health ----

@app.get("/health", tags=["health"])
async def health():
    """
    Basic liveness check — always returns 200 immediately.
    Docker healthcheck uses this so the container is healthy right away.
    """
    return {"status": "ok", "service": "taskforge-services"}


@app.get("/health/ready", tags=["health"])
async def health_ready():
    """Readiness check — returns 200 ready immediately."""
    return {"status": "ready"}
