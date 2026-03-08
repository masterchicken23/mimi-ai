"""
Concrete EmailManager implementation for Microsoft Outlook via Graph API v1.0.

Delegated permissions used: User.Read, Mail.ReadWrite, Mail.Send.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.models.email import (
    DraftEmailRequest,
    EmailAttachmentInfo,
    EmailListResponse,
    EmailMessage,
    EmailProvider,
    EmailRecipient,
    ForwardEmailRequest,
    MessageImportance,
    ReplyEmailRequest,
    SendEmailRequest,
)
from app.services.email_manager import EmailManager
from app.services.outlook import auth as outlook_auth

log = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
TIMEOUT = 30.0


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _make_recipient(address: str) -> dict:
    return {"emailAddress": {"address": address}}


def _parse_recipient(raw: dict | None) -> EmailRecipient | None:
    if not raw:
        return None
    ea = raw.get("emailAddress", {})
    return EmailRecipient(emailAddress={"name": ea.get("name"), "address": ea.get("address", "")})


def _parse_message(data: dict) -> EmailMessage:
    body = data.get("body", {})
    from_raw = data.get("from")
    return EmailMessage(
        id=data["id"],
        provider=EmailProvider.OUTLOOK,
        subject=data.get("subject"),
        body_preview=data.get("bodyPreview"),
        body_content=body.get("content"),
        body_content_type=body.get("contentType", "text"),
        **{"from": _parse_recipient(from_raw)},
        to_recipients=[_parse_recipient(r) for r in data.get("toRecipients", []) if r],
        cc_recipients=[_parse_recipient(r) for r in data.get("ccRecipients", []) if r],
        bcc_recipients=[_parse_recipient(r) for r in data.get("bccRecipients", []) if r],
        received_at=data.get("receivedDateTime"),
        sent_at=data.get("sentDateTime"),
        is_read=data.get("isRead"),
        is_draft=data.get("isDraft"),
        importance=MessageImportance(data.get("importance", "normal")),
        has_attachments=data.get("hasAttachments", False),
        attachments=[
            EmailAttachmentInfo(
                id=a["id"],
                name=a.get("name", ""),
                contentType=a.get("contentType", "application/octet-stream"),
                size=a.get("size", 0),
            )
            for a in data.get("attachments", [])
        ],
        conversation_id=data.get("conversationId"),
        parent_folder_id=data.get("parentFolderId"),
        web_link=data.get("webLink"),
    )


async def _graph_request(
    method: str,
    path: str,
    token: str,
    *,
    json: Any = None,
    params: dict | None = None,
) -> httpx.Response:
    url = f"{GRAPH_BASE}{path}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.request(method, url, headers=headers, json=json, params=params)
    if resp.status_code >= 400:
        log.error("Graph API %s %s -> %s: %s", method, path, resp.status_code, resp.text)
        resp.raise_for_status()
    return resp


# ------------------------------------------------------------------
# Service
# ------------------------------------------------------------------

class OutlookEmailService(EmailManager):

    # -- Auth delegates ------------------------------------------------

    async def get_auth_url(self, state: Optional[str] = None) -> str:
        url, _ = outlook_auth.initiate_auth_flow(state)
        return url

    async def handle_auth_callback(self, code: str, state: Optional[str] = None) -> dict:
        # `code` not used directly -- we pass full query params via router
        raise NotImplementedError("Use complete_auth_flow with full query params instead.")

    async def refresh_token_if_needed(self, user_id: str) -> str:
        return outlook_auth.get_access_token(user_id)

    async def logout(self, user_id: str) -> None:
        outlook_auth.remove_tokens(user_id)

    # -- Read ----------------------------------------------------------

    async def list_messages(
        self,
        user_id: str,
        *,
        folder: str = "inbox",
        top: int = 25,
        skip: int = 0,
        search: Optional[str] = None,
        order_by: str = "receivedDateTime desc",
    ) -> EmailListResponse:
        token = outlook_auth.get_access_token(user_id)
        params: dict[str, Any] = {
            "$top": top,
            "$skip": skip,
            "$orderby": order_by,
            "$select": (
                "id,subject,bodyPreview,from,toRecipients,ccRecipients,"
                "receivedDateTime,sentDateTime,isRead,isDraft,importance,"
                "hasAttachments,conversationId,parentFolderId,webLink"
            ),
        }
        if search:
            params["$search"] = f'"{search}"'

        resp = await _graph_request("GET", f"/me/mailFolders/{folder}/messages", token, params=params)
        data = resp.json()

        messages = [_parse_message(m) for m in data.get("value", [])]
        return EmailListResponse(
            messages=messages,
            next_link=data.get("@odata.nextLink"),
            total_count=data.get("@odata.count"),
        )

    async def get_message(self, user_id: str, message_id: str) -> EmailMessage:
        token = outlook_auth.get_access_token(user_id)
        params = {
            "$expand": "attachments($select=id,name,contentType,size)",
        }
        resp = await _graph_request("GET", f"/me/messages/{message_id}", token, params=params)
        return _parse_message(resp.json())

    # -- Write ---------------------------------------------------------

    async def send_message(self, user_id: str, payload: SendEmailRequest) -> None:
        token = outlook_auth.get_access_token(user_id)
        body: dict[str, Any] = {
            "message": {
                "subject": payload.subject,
                "body": {"contentType": payload.body_type, "content": payload.body},
                "toRecipients": [_make_recipient(a) for a in payload.to_recipients],
                "ccRecipients": [_make_recipient(a) for a in payload.cc_recipients],
                "bccRecipients": [_make_recipient(a) for a in payload.bcc_recipients],
                "importance": payload.importance.value,
            },
            "saveToSentItems": payload.save_to_sent_items,
        }
        await _graph_request("POST", "/me/sendMail", token, json=body)

    async def create_draft(self, user_id: str, payload: DraftEmailRequest) -> EmailMessage:
        token = outlook_auth.get_access_token(user_id)
        body: dict[str, Any] = {
            "subject": payload.subject or "",
            "body": {"contentType": payload.body_type, "content": payload.body or ""},
            "toRecipients": [_make_recipient(a) for a in payload.to_recipients],
            "ccRecipients": [_make_recipient(a) for a in payload.cc_recipients],
            "bccRecipients": [_make_recipient(a) for a in payload.bcc_recipients],
            "importance": payload.importance.value,
        }
        resp = await _graph_request("POST", "/me/messages", token, json=body)
        return _parse_message(resp.json())

    async def update_draft(self, user_id: str, message_id: str, payload: DraftEmailRequest) -> EmailMessage:
        token = outlook_auth.get_access_token(user_id)
        body: dict[str, Any] = {}
        if payload.subject is not None:
            body["subject"] = payload.subject
        if payload.body is not None:
            body["body"] = {"contentType": payload.body_type, "content": payload.body}
        if payload.to_recipients:
            body["toRecipients"] = [_make_recipient(a) for a in payload.to_recipients]
        if payload.cc_recipients:
            body["ccRecipients"] = [_make_recipient(a) for a in payload.cc_recipients]
        if payload.bcc_recipients:
            body["bccRecipients"] = [_make_recipient(a) for a in payload.bcc_recipients]
        body["importance"] = payload.importance.value

        resp = await _graph_request("PATCH", f"/me/messages/{message_id}", token, json=body)
        return _parse_message(resp.json())

    async def send_draft(self, user_id: str, message_id: str) -> None:
        token = outlook_auth.get_access_token(user_id)
        await _graph_request("POST", f"/me/messages/{message_id}/send", token)

    async def reply_to_message(self, user_id: str, message_id: str, payload: ReplyEmailRequest) -> None:
        token = outlook_auth.get_access_token(user_id)
        body = {"comment": payload.comment}
        await _graph_request("POST", f"/me/messages/{message_id}/reply", token, json=body)

    async def forward_message(self, user_id: str, message_id: str, payload: ForwardEmailRequest) -> None:
        token = outlook_auth.get_access_token(user_id)
        body: dict[str, Any] = {
            "comment": payload.comment,
            "toRecipients": [_make_recipient(a) for a in payload.to_recipients],
        }
        await _graph_request("POST", f"/me/messages/{message_id}/forward", token, json=body)

    async def delete_message(self, user_id: str, message_id: str) -> None:
        token = outlook_auth.get_access_token(user_id)
        await _graph_request("DELETE", f"/me/messages/{message_id}", token)
