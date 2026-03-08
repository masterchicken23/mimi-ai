from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class EmailProvider(str, Enum):
    OUTLOOK = "outlook"
    GOOGLE = "google"


class MessageImportance(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"


# ---------------------------------------------------------------------------
# Shared sub-models
# ---------------------------------------------------------------------------

class EmailAddress(BaseModel):
    name: Optional[str] = None
    address: str


class EmailRecipient(BaseModel):
    email_address: EmailAddress = Field(alias="emailAddress", default=None)

    model_config = {"populate_by_name": True}


class EmailAttachmentInfo(BaseModel):
    id: str
    name: str
    content_type: str = Field(alias="contentType", default="application/octet-stream")
    size: int = 0

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Message (read)
# ---------------------------------------------------------------------------

class EmailMessage(BaseModel):
    """Provider-agnostic representation of an email message."""

    id: str
    provider: EmailProvider
    subject: Optional[str] = None
    body_preview: Optional[str] = None
    body_content: Optional[str] = None
    body_content_type: Optional[str] = "text"
    from_: Optional[EmailRecipient] = Field(None, alias="from")
    to_recipients: list[EmailRecipient] = []
    cc_recipients: list[EmailRecipient] = []
    bcc_recipients: list[EmailRecipient] = []
    received_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    is_read: Optional[bool] = None
    is_draft: Optional[bool] = None
    importance: MessageImportance = MessageImportance.NORMAL
    has_attachments: bool = False
    attachments: list[EmailAttachmentInfo] = []
    conversation_id: Optional[str] = None
    parent_folder_id: Optional[str] = None
    web_link: Optional[str] = None

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class SendEmailRequest(BaseModel):
    subject: str
    body: str
    body_type: str = "HTML"
    to_recipients: list[str]
    cc_recipients: list[str] = []
    bcc_recipients: list[str] = []
    importance: MessageImportance = MessageImportance.NORMAL
    save_to_sent_items: bool = True


class DraftEmailRequest(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    body_type: str = "HTML"
    to_recipients: list[str] = []
    cc_recipients: list[str] = []
    bcc_recipients: list[str] = []
    importance: MessageImportance = MessageImportance.NORMAL


class ReplyEmailRequest(BaseModel):
    comment: str
    body_type: str = "HTML"


class ForwardEmailRequest(BaseModel):
    comment: str = ""
    body_type: str = "HTML"
    to_recipients: list[str]


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

class EmailListResponse(BaseModel):
    messages: list[EmailMessage]
    next_link: Optional[str] = None
    total_count: Optional[int] = None
