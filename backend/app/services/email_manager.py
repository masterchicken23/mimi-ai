"""
Abstract base class for email providers.

Every concrete provider (Outlook, Google, ...) must implement this interface
so the rest of the application stays provider-agnostic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from app.models.email import (
    DraftEmailRequest,
    EmailListResponse,
    EmailMessage,
    ForwardEmailRequest,
    ReplyEmailRequest,
    SendEmailRequest,
)


class EmailManager(ABC):
    """Provider-agnostic contract for email operations."""

    # ------------------------------------------------------------------
    # Auth helpers
    # ------------------------------------------------------------------

    @abstractmethod
    async def get_auth_url(self, state: Optional[str] = None) -> str:
        """Return the URL the user should be redirected to for OAuth consent."""

    @abstractmethod
    async def handle_auth_callback(self, code: str, state: Optional[str] = None) -> dict:
        """Exchange the auth code for tokens; return user info dict."""

    @abstractmethod
    async def refresh_token_if_needed(self, user_id: str) -> str:
        """Return a valid access token, refreshing silently if necessary."""

    @abstractmethod
    async def logout(self, user_id: str) -> None:
        """Remove stored tokens for the user."""

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    @abstractmethod
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
        """List messages from a mail folder with paging & search."""

    @abstractmethod
    async def get_message(self, user_id: str, message_id: str) -> EmailMessage:
        """Fetch a single message by ID."""

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    @abstractmethod
    async def send_message(self, user_id: str, payload: SendEmailRequest) -> None:
        """Compose and send an email in one step."""

    @abstractmethod
    async def create_draft(self, user_id: str, payload: DraftEmailRequest) -> EmailMessage:
        """Create a draft message."""

    @abstractmethod
    async def update_draft(self, user_id: str, message_id: str, payload: DraftEmailRequest) -> EmailMessage:
        """Update an existing draft."""

    @abstractmethod
    async def send_draft(self, user_id: str, message_id: str) -> None:
        """Send a previously created draft."""

    @abstractmethod
    async def reply_to_message(self, user_id: str, message_id: str, payload: ReplyEmailRequest) -> None:
        """Reply to a message."""

    @abstractmethod
    async def forward_message(self, user_id: str, message_id: str, payload: ForwardEmailRequest) -> None:
        """Forward a message to new recipients."""

    @abstractmethod
    async def delete_message(self, user_id: str, message_id: str) -> None:
        """Delete (move to trash) a message."""
