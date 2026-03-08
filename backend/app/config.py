import os
from pathlib import Path

from pydantic_settings import BaseSettings

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"

# Manually parse .env to handle Windows encoding edge cases (BOM, UTF-16, etc.)
if _ENV_FILE.is_file():
    for encoding in ("utf-8-sig", "utf-8", "utf-16", "latin-1"):
        try:
            raw = _ENV_FILE.read_text(encoding=encoding)
            for line in raw.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip()
                    if key and key not in os.environ:
                        os.environ[key] = value
            break
        except (UnicodeDecodeError, UnicodeError):
            continue


class Settings(BaseSettings):
    # -- App --
    app_name: str = "Mimi AI Backend"
    debug: bool = False
    frontend_origin: str = "http://localhost:5173"
    backend_origin: str = "http://localhost:8000"
    secret_key: str = "change-me-in-production"

    # -- Microsoft Entra ID (Azure AD) --
    ms_client_id: str = ""
    ms_client_secret: str = ""
    ms_tenant_id: str = "common"
    ms_redirect_path: str = "/auth/outlook/callback"

    @property
    def ms_authority(self) -> str:
        return f"https://login.microsoftonline.com/{self.ms_tenant_id}"

    @property
    def ms_redirect_uri(self) -> str:
        return f"{self.backend_origin}{self.ms_redirect_path}"

    ms_scopes: list[str] = [
        "User.Read",
        "Mail.ReadWrite",
        "Mail.Send",
    ]

    model_config = {"extra": "ignore"}


settings = Settings()

if not settings.ms_client_id or not settings.ms_client_secret:
    raise RuntimeError(
        f"MS_CLIENT_ID and MS_CLIENT_SECRET must be set.\n"
        f"  .env path: {_ENV_FILE} (exists={_ENV_FILE.is_file()})\n"
        f"  MS_CLIENT_ID in os.environ: {bool(os.environ.get('MS_CLIENT_ID'))}\n"
        f"  MS_CLIENT_SECRET in os.environ: {bool(os.environ.get('MS_CLIENT_SECRET'))}\n"
        f"  Loaded ms_client_id: '{settings.ms_client_id[:8]}...' (len={len(settings.ms_client_id)})"
    )
