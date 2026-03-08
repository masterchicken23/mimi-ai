"""
OAuth2 authentication endpoints for email providers.

Current providers: Outlook (Microsoft Graph).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from app.config import settings
from app.services.outlook import auth as outlook_auth

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# ------------------------------------------------------------------
# Session helpers  (signed cookie via itsdangerous)
# ------------------------------------------------------------------

def _set_user_session(request: Request, user_id: str, display_name: str, email: str) -> None:
    request.state._session = {"user_id": user_id, "display_name": display_name, "email": email, "provider": "outlook"}


def _get_user_session(request: Request) -> dict | None:
    return getattr(request.state, "_session", None) or request.session  # type: ignore[attr-defined]


# ------------------------------------------------------------------
# Outlook
# ------------------------------------------------------------------

@router.get("/outlook/login")
async def outlook_login():
    """Redirect the user to Microsoft's consent page."""
    try:
        auth_url, state = outlook_auth.initiate_auth_flow()
    except Exception as exc:
        log.exception("Failed to start auth flow")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return RedirectResponse(auth_url)


@router.get("/outlook/callback")
async def outlook_callback(request: Request):
    """
    Handle the redirect back from Microsoft.
    On success, store tokens and redirect the user to the frontend.
    """
    query_params = dict(request.query_params)
    if "error" in query_params:
        raise HTTPException(
            status_code=400,
            detail=query_params.get("error_description", query_params["error"]),
        )
    try:
        result = outlook_auth.complete_auth_flow(query_params)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    request.session["user_id"] = result["user_id"]
    request.session["display_name"] = result["display_name"]
    request.session["email"] = result["email"]
    request.session["provider"] = "outlook"

    return RedirectResponse(f"{settings.frontend_origin}/dashboard?auth=success")


@router.get("/outlook/status")
async def outlook_status(request: Request):
    """Check whether the current session has valid Outlook tokens."""
    user_id = request.session.get("user_id")
    if not user_id or not outlook_auth.has_tokens(user_id):
        return {"authenticated": False}

    return {
        "authenticated": True,
        "provider": "outlook",
        "user_id": user_id,
        "display_name": request.session.get("display_name"),
        "email": request.session.get("email"),
    }


@router.post("/outlook/logout")
async def outlook_logout(request: Request):
    user_id = request.session.get("user_id")
    if user_id:
        outlook_auth.remove_tokens(user_id)
    request.session.clear()
    return {"status": "logged_out"}


# ------------------------------------------------------------------
# Generic helper used by other routers
# ------------------------------------------------------------------

def require_user_id(request: Request) -> str:
    """Extract authenticated user_id from session or raise 401."""
    user_id = request.session.get("user_id")
    if not user_id or not outlook_auth.has_tokens(user_id):
        raise HTTPException(status_code=401, detail="Not authenticated. Please connect your email account first.")
    return user_id
