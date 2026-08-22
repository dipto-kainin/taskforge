"""
OTP router — Phase 2 stub.
Tables are pre-created in the DB migration (search.otp_tokens).
These endpoints return informative stubs so the gateway/frontend can
reference them without errors — full implementation in Phase 2.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/otp", tags=["otp"])


class SendOTPRequest(BaseModel):
    user_id: str
    delivery: str = "email"  # email | sms (future)


class VerifyOTPRequest(BaseModel):
    user_id: str
    code: str


@router.post("/send", status_code=202)
async def send_otp(req: SendOTPRequest):
    """[Phase 2 Stub] Send MFA OTP to user."""
    return {
        "status": "stub",
        "message": "MFA OTP feature is coming in Phase 2. Infrastructure (DB table) is ready.",
        "user_id": req.user_id,
    }


@router.post("/verify", status_code=200)
async def verify_otp(req: VerifyOTPRequest):
    """[Phase 2 Stub] Verify MFA OTP code."""
    return {
        "status": "stub",
        "valid": False,
        "message": "MFA OTP feature is coming in Phase 2.",
    }
