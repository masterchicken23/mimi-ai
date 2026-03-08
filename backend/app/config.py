from pydantic_settings import BaseSettings


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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
