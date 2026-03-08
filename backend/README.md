# Mimi AI  --  Backend

FastAPI backend that provides email management via the Microsoft Graph API (Outlook) with delegated permissions.

## Architecture

```
backend/
├── app/
│   ├── main.py                          # FastAPI entry-point
│   ├── config.py                        # pydantic-settings config
│   ├── models/
│   │   └── email.py                     # Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py                      # OAuth2 login/callback/status/logout
│   │   └── email.py                     # Email CRUD endpoints
│   └── services/
│       ├── email_manager.py             # Abstract base class (provider-agnostic)
│       └── outlook/
│           ├── auth.py                  # MSAL auth-code flow + token cache
│           └── email_service.py         # Microsoft Graph v1.0 implementation
├── personas/                            # Hackathon persona data
├── requirements.txt
├── .env.example
└── README.md
```

## Quick start

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt

cp .env.example .env
# Edit .env and fill in your Microsoft Entra ID credentials

uvicorn app.main:app --reload
```

The API will be available at **http://localhost:8000**.
Interactive docs at **http://localhost:8000/docs**.

## Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **App registrations** > **New registration**.
2. Set **Redirect URI** (Web) to `http://localhost:8000/auth/outlook/callback`.
3. Under **API permissions**, add **Microsoft Graph (Delegated)**:
   - `User.Read`
   - `Mail.ReadWrite`
   - `Mail.Send`
4. Under **Certificates & secrets**, create a new **Client secret**.
5. Copy **Application (client) ID**, **Directory (tenant) ID**, and the secret value into your `.env`.

## API Endpoints

### Auth

| Method | Path                       | Description                          |
|--------|----------------------------|--------------------------------------|
| GET    | `/auth/outlook/login`      | Redirect to Microsoft consent page   |
| GET    | `/auth/outlook/callback`   | OAuth2 callback (handled by MSAL)    |
| GET    | `/auth/outlook/status`     | Check if session is authenticated    |
| POST   | `/auth/outlook/logout`     | Clear tokens and session             |

### Email

| Method | Path                                  | Description                |
|--------|---------------------------------------|----------------------------|
| GET    | `/email/messages`                     | List messages (paginated)  |
| GET    | `/email/messages/{id}`                | Get single message         |
| POST   | `/email/send`                         | Send an email              |
| POST   | `/email/draft`                        | Create a draft             |
| PATCH  | `/email/draft/{id}`                   | Update a draft             |
| POST   | `/email/draft/{id}/send`              | Send a draft               |
| POST   | `/email/messages/{id}/reply`          | Reply to a message         |
| POST   | `/email/messages/{id}/forward`        | Forward a message          |
| DELETE | `/email/messages/{id}`                | Delete a message           |

### Utility

| Method | Path       | Description    |
|--------|------------|----------------|
| GET    | `/health`  | Health check   |

## Extending to Google

The `EmailManager` abstract class in `services/email_manager.py` defines the provider-agnostic interface.
To add Gmail support, create `services/google/` with its own `auth.py` and `email_service.py`
implementing the same contract, then register it in the router's `_get_service` factory.
