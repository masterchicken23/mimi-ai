"""
REST endpoints for email operations.

All routes require an authenticated session (Outlook tokens).
The voice assistant will later call these same endpoints via tool-use.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.models.email import (
    DraftEmailRequest,
    EmailListResponse,
    EmailMessage,
    ForwardEmailRequest,
    ReplyEmailRequest,
    SendEmailRequest,
)
from app.routers.auth import require_user_id
from app.services.outlook.email_service import OutlookEmailService

router = APIRouter(prefix="/email", tags=["email"])

_outlook_service = OutlookEmailService()


def _get_service(request: Request) -> OutlookEmailService:
    """
    Returns the appropriate email service based on the session provider.
    Currently only Outlook is implemented; extend this when Google is added.
    """
    provider = request.session.get("provider", "outlook")
    if provider == "outlook":
        return _outlook_service
    raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")


# ------------------------------------------------------------------
# Read
# ------------------------------------------------------------------

@router.get("/messages", response_model=EmailListResponse)
async def list_messages(
    request: Request,
    user_id: str = Depends(require_user_id),
    folder: str = Query("inbox", description="Mail folder name or ID"),
    top: int = Query(25, ge=1, le=100),
    skip: int = Query(0, ge=0),
    search: Optional[str] = Query(None, description="Free-text search query"),
    order_by: str = Query("receivedDateTime desc"),
):
    svc = _get_service(request)
    try:
        return await svc.list_messages(user_id, folder=folder, top=top, skip=skip, search=search, order_by=order_by)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/messages/{message_id}", response_model=EmailMessage)
async def get_message(
    message_id: str,
    request: Request,
    user_id: str = Depends(require_user_id),
):
    svc = _get_service(request)
    try:
        return await svc.get_message(user_id, message_id)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


# ------------------------------------------------------------------
# Send
# ------------------------------------------------------------------

@router.post("/send", status_code=202)
async def send_message(
    payload: SendEmailRequest,
    request: Request,
    user_id: str = Depends(require_user_id),
):
    svc = _get_service(request)
    try:
        await svc.send_message(user_id, payload)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {"status": "sent"}


# ------------------------------------------------------------------
# Drafts
# ------------------------------------------------------------------

@router.post("/draft", response_model=EmailMessage, status_code=201)
async def create_draft(
    payload: DraftEmailRequest,
    request: Request,
    user_id: str = Depends(require_user_id),
):
    svc = _get_service(request)
    try:
        return await svc.create_draft(user_id, payload)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.patch("/draft/{message_id}", response_model=EmailMessage)
async def update_draft(
    message_id: str,
    payload: DraftEmailRequest,
    request: Request,
    user_id: str = Depends(require_user_id),
):
    svc = _get_service(request)
    try:
        return await svc.update_draft(user_id, message_id, payload)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.post("/draft/{message_id}/send", status_code=202)
async def send_draft(
    message_id: str,
    request: Request,
    user_id: str = Depends(require_user_id),
):
    svc = _get_service(request)
    try:
        await svc.send_draft(user_id, message_id)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {"status": "sent"}


# ------------------------------------------------------------------
# Reply / Forward
# ------------------------------------------------------------------

@router.post("/messages/{message_id}/reply", status_code=202)
async def reply_to_message(
    message_id: str,
    payload: ReplyEmailRequest,
    request: Request,
    user_id: str = Depends(require_user_id),
):
    svc = _get_service(request)
    try:
        await svc.reply_to_message(user_id, message_id, payload)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {"status": "replied"}


@router.post("/messages/{message_id}/forward", status_code=202)
async def forward_message(
    message_id: str,
    payload: ForwardEmailRequest,
    request: Request,
    user_id: str = Depends(require_user_id),
):
    svc = _get_service(request)
    try:
        await svc.forward_message(user_id, message_id, payload)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return {"status": "forwarded"}


# ------------------------------------------------------------------
# Delete
# ------------------------------------------------------------------

@router.delete("/messages/{message_id}", status_code=204)
async def delete_message(
    message_id: str,
    request: Request,
    user_id: str = Depends(require_user_id),
):
    svc = _get_service(request)
    try:
        await svc.delete_message(user_id, message_id)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
