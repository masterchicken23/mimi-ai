"""
MSAL helper for the Outlook / Microsoft Graph provider.

Uses the Authorization-Code flow (delegated permissions) so the app acts
on behalf of a signed-in user.

Token cache is kept **in-memory** (per-user SerializableTokenCache).  For
production, swap to a persistent store (Redis, DB, encrypted file, etc.).

Pending auth flows are stored in memory and on disk so the callback still
works after a uvicorn reload (e.g. --reload).
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Optional

import msal

from app.config import settings

log = logging.getLogger(__name__)

# In-memory store: user_id -> serialised token cache JSON
_token_caches: dict[str, str] = {}

# Temporary store for pending auth flows (state -> flow dict)
_pending_flows: dict[str, dict] = {}

# Disk fallback for pending flows (survives process restart / --reload)
_AUTH_FLOWS_DIR = Path(__file__).resolve().parent.parent.parent / ".auth_flows"
_FLOW_TTL_SECONDS = 600  # 10 minutes


def _flow_file_path(state: str) -> Path:
    safe_name = hashlib.sha256(state.encode()).hexdigest()[:32]
    return _AUTH_FLOWS_DIR / f"{safe_name}.json"


def _save_flow_to_disk(state: str, flow: dict) -> None:
    _AUTH_FLOWS_DIR.mkdir(parents=True, exist_ok=True)
    path = _flow_file_path(state)
    try:
        path.write_text(json.dumps({"state": state, "flow": flow, "ts": time.time()}), encoding="utf-8")
    except Exception as e:
        log.warning("Could not persist auth flow to disk: %s", e)


def _load_flow_from_disk(state: str) -> dict | None:
    path = _flow_file_path(state)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if time.time() - data.get("ts", 0) > _FLOW_TTL_SECONDS:
            path.unlink(missing_ok=True)
            return None
        path.unlink(missing_ok=True)
        return data.get("flow")
    except Exception as e:
        log.warning("Could not load auth flow from disk: %s", e)
        path.unlink(missing_ok=True)
        return None


def _build_msal_app(cache: Optional[msal.SerializableTokenCache] = None) -> msal.ConfidentialClientApplication:
    return msal.ConfidentialClientApplication(
        client_id=settings.ms_client_id,
        client_credential=settings.ms_client_secret,
        authority=settings.ms_authority,
        token_cache=cache,
    )


# ------------------------------------------------------------------
# Public helpers
# ------------------------------------------------------------------

def initiate_auth_flow(state: Optional[str] = None) -> tuple[str, str]:
    """
    Start the auth-code flow.
    Returns (auth_url, state) -- caller must redirect the user to auth_url.
    """
    app = _build_msal_app()
    flow = app.initiate_auth_code_flow(
        scopes=settings.ms_scopes,
        redirect_uri=settings.ms_redirect_uri,
        state=state,
    )
    if "auth_uri" not in flow:
        raise RuntimeError(f"MSAL auth flow error: {flow}")

    effective_state = flow.get("state", state or "")
    _pending_flows[effective_state] = flow
    _save_flow_to_disk(effective_state, flow)
    return flow["auth_uri"], effective_state


def complete_auth_flow(query_params: dict) -> dict:
    """
    Finish the auth-code flow using the query parameters from the callback.
    Returns the MSAL token result dict which contains id_token_claims, access_token, etc.
    """
    state = query_params.get("state", "")
    flow = _pending_flows.pop(state, None)
    if flow is None:
        flow = _load_flow_from_disk(state)
    if flow is None:
        raise ValueError("Auth flow not found or expired. Please start login again.")

    cache = msal.SerializableTokenCache()
    app = _build_msal_app(cache=cache)
    result = app.acquire_token_by_auth_code_flow(flow, query_params)

    if "error" in result:
        raise ValueError(f"Token acquisition failed: {result.get('error_description', result['error'])}")

    # Derive a stable user_id from the token claims
    claims = result.get("id_token_claims", {})
    user_id = claims.get("oid") or claims.get("sub") or ""
    if not user_id:
        raise ValueError("Could not determine user_id from token claims.")

    # Persist the serialised cache
    if cache.has_state_changed:
        _token_caches[user_id] = cache.serialize()

    return {
        "user_id": user_id,
        "display_name": claims.get("name", ""),
        "email": claims.get("preferred_username", ""),
        "access_token": result.get("access_token"),
    }


def get_access_token(user_id: str) -> str:
    """
    Return a valid access token for *user_id*, using the refresh token
    from the cached token if necessary.
    """
    serialised = _token_caches.get(user_id)
    if not serialised:
        raise PermissionError("No cached tokens for this user. Please authenticate first.")

    cache = msal.SerializableTokenCache()
    cache.deserialize(serialised)
    app = _build_msal_app(cache=cache)

    accounts = app.get_accounts()
    if not accounts:
        raise PermissionError("No accounts in token cache. Please re-authenticate.")

    result = app.acquire_token_silent(
        scopes=settings.ms_scopes,
        account=accounts[0],
    )
    if not result or "access_token" not in result:
        raise PermissionError("Silent token acquisition failed. Please re-authenticate.")

    if cache.has_state_changed:
        _token_caches[user_id] = cache.serialize()

    return result["access_token"]


def remove_tokens(user_id: str) -> None:
    _token_caches.pop(user_id, None)


def has_tokens(user_id: str) -> bool:
    return user_id in _token_caches
