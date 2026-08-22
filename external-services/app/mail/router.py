"""
Mail router — email sending endpoints (internal use only).

POST /api/mail/invite — send a project invite email
"""

import logging

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

from app.mail.service import send_invite_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mail", tags=["mail"])


class InviteEmailRequest(BaseModel):
    to_email: str
    inviter_name: str
    project_name: str
    project_id: str
    token: str = ""
    role: str = "member"
    invitee_exists: bool = True   # False if user has no account yet


@router.post("/invite", status_code=202)
async def invite_email(req: InviteEmailRequest):
    """
    Send a project invite email.
    Returns 202 Accepted immediately — email is sent asynchronously.
    Failure to send email does NOT fail the invite (logged as warning).
    """
    sent = await send_invite_email(
        to_email=req.to_email,
        inviter_name=req.inviter_name,
        project_name=req.project_name,
        role=req.role,
        project_id=req.project_id,
        token=req.token,
        invitee_exists=req.invitee_exists,
    )
    return {"status": "sent" if sent else "skipped", "to": req.to_email}
