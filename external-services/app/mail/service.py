"""
Mail service — pure SMTP email delivery (Gmail App Password) with Jinja2 HTML templates.
"""

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
import smtplib
import urllib.parse

from jinja2 import Environment, FileSystemLoader, select_autoescape
from app.config import get_settings

logger = logging.getLogger(__name__)

# Template directory
_TEMPLATE_DIR = Path(__file__).parent / "templates"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
)


def _render(template_name: str, context: dict) -> str:
    tpl = _jinja_env.get_template(template_name)
    return tpl.render(**context)


async def send_invite_email(
    to_email: str,
    inviter_name: str,
    project_name: str,
    role: str,
    project_id: str,
    token: str = "",
    invitee_exists: bool = True,
) -> bool:
    """
    Send a project invite email via SMTP (Gmail App Password).
    - Email contains a temporal JWT invite token embedding email, project_id, and 7-day expiration.
    """
    settings = get_settings()

    if not settings.smtp_user or not settings.smtp_password:
        logger.warning("SMTP_USER or SMTP_PASSWORD not set — skipping invite email")
        return False

    if not token:
        logger.error("No invite JWT token provided for send_invite_email — aborting email delivery")
        return False

    frontend_url = settings.frontend_url.rstrip("/")
    encoded_email = urllib.parse.quote(to_email)
    encoded_token = urllib.parse.quote(token)
    cta_url = f"{frontend_url}/login?invite=1&email={encoded_email}&token={encoded_token}"
    cta_text = "Join Project & Get Started"

    subject = f"You've been invited to {project_name} on TaskForge"
    html = _render("invite.html", {
        "inviter_name": inviter_name,
        "project_name": project_name,
        "role": role.capitalize(),
        "cta_url": cta_url,
        "cta_text": cta_text,
        "frontend_url": frontend_url,
        "to_email": to_email,
    })

    return _send_via_smtp(to_email, subject, html, settings, project_id)


def _send_via_smtp(to_email: str, subject: str, html: str, settings, project_id: str) -> bool:
    try:
        sender_email = settings.smtp_user
        # Auto-strip spaces (e.g. 'hhwk wusw gyny ydbu' -> 'hhwkwuswgynyydbu')
        smtp_pass = settings.smtp_password.strip().replace(" ", "").replace("'", "").replace('"', '')
        from_header = f"TaskForge <{sender_email}>"

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_header
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html"))

        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.login(sender_email, smtp_pass)
                server.sendmail(sender_email, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.starttls()
                server.login(sender_email, smtp_pass)
                server.sendmail(sender_email, [to_email], msg.as_string())

        logger.info(f"Invite email sent via SMTP (Gmail) to {to_email} for project {project_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to send invite email via SMTP to {to_email}: {e}")
        return False
