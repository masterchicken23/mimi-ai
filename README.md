## Mimi AI

Mimi AI is a voice-first companion designed for people living with Parkinson's. It connects to your bank (via Plaid), your email, and your calendar (via Microsoft Outlook / Graph), then surfaces an AI “Mimi” persona that can talk you through your finances, calendar, recent activity, and next steps so you can stay on top of things by speaking, not typing or tapping.

---

### How to run the demo

If the project is distributed **with `backend/.env` and `frontend/.env` already configured**, run the app immediately—no need to create accounts or obtain keys.

**Prerequisites:** Node.js v20+ and npm v10+.

1. **Start the backend** (from the project root):
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   Leave this terminal open. The backend runs at **http://localhost:8080**.

2. **Start the frontend** (in a second terminal):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The frontend runs at **http://localhost:5173**.

3. **Open the app** at `http://localhost:5173` in your browser.

4. **Use the demo** in one of two ways:
   - **Option A – Demo persona (no login):** Choose **Maya Patel** from the intro flow. No Plaid or Outlook sign-in required. Mimi uses the bundled fictional data (emails, transactions, calendar). Try asking e.g. "What's my next calendar appointment?"
   - **Option B – Connect Plaid and Outlook:** Click to connect Plaid and use the **fictional** Sandbox credentials: **Username** `user_good`, **Password** `pass_good` (bank: choose any). Then connect Outlook and sign in with a Microsoft account. Mimi will use that account's email and calendar plus the Plaid sandbox data.

Allow microphone access when you start a voice session. That's the full demo.

---

### Quick start (when .env is not included)

If you don't have the preconfigured `.env` files (e.g. you cloned the public repo), create `backend/.env` and `frontend/.env` and fill in your own keys. See **Environment variables and API keys** below for what each variable is and how to obtain Plaid, Microsoft, and Vapi credentials.

**Prerequisites:** Node.js v20+, npm v10+, and (for connecting Outlook in the app) a Microsoft account. For Plaid you still use the fictional Sandbox credentials (`user_good` / `pass_good`); the backend needs your Plaid Sandbox app keys in `.env`.

1. **Clone** (if needed): `git clone <REPO_URL> mimi-ai && cd mimi-ai`
2. **Backend:** Copy `backend/.env.example` to `backend/.env`, fill in all variables, then `cd backend && npm install && npm run dev`.
3. **Frontend:** Create `frontend/.env` with `VITE_API_BASE=http://localhost:8080` and `VITE_VAPI_PUBLIC_KEY=...`, then `cd frontend && npm install && npm run dev`.
4. Open **http://localhost:5173** and use the app as described in **How to run the demo** (Maya persona or connect Plaid + Outlook).

---

### Tech stack & architecture

#### **Tech stack**

- **Frontend**
  - React (Vite, React 19)
  - Tailwind CSS
  - `@vapi-ai/web` for the voice assistant
  - `react-plaid-link` for Plaid Link
  - `react-router-dom`, `recharts` for routing and charts

- **Backend**
  - Node.js + Express
  - `@azure/msal-node` + Microsoft Graph API (Outlook email)
  - `plaid` (Plaid Node SDK)
  - `express-session`, `cors`, `dotenv`
  - Synthetic persona dataset in JSON/JSONL under `backend/personas/`

- **(Optional prototype)**: Python + FastAPI backend under `backend/app` with `uvicorn`, `pydantic`, `msal`, etc. (not required for the main demo).

#### **Architecture diagram (simplified)**

```text
[ Browser (React + Vite) ]
        |
        |  HTTPS (REST, WebSocket for Vapi)
        v
[ Node/Express Backend (server.js) ]
        |
        |--- Plaid API (sandbox)
        |
        |--- Microsoft Graph API (Outlook / Mail + Calendar)
        |
        |--- Local persona dataset (backend/personas/*)
```

- The **frontend** talks to `http://localhost:8080` for:
  - `/api/plaid/*` (link token, public token exchange, transaction data)
  - `/auth/outlook/*` (login, callback, status)
  - `/api/email/*` (list messages, send email, etc.)
  - `/api/calendar/*` (list calendar events from Outlook)
- The **backend**:
  - Stores short-lived session data in server memory / filesystem (`.token_cache`).
  - Manages MSAL auth code flow for Outlook.
  - Calls Plaid sandbox APIs using your sandbox keys.
- **Vapi** runs externally and is called directly from the browser via the `@vapi-ai/web` SDK using `VITE_VAPI_PUBLIC_KEY`.

---

### Environment variables and API keys

Only needed when the project does **not** come with preconfigured `.env` files (e.g. you cloned the repo and need to add your own keys). Run the app as in **How to run the demo** after filling these in.

#### **Backend and frontend `.env`**

##### Backend `backend/.env` (use `backend/.env.example` as template)

```bash
# App
PORT=8080
FRONTEND_ORIGIN=http://localhost:5173
BACKEND_ORIGIN=http://localhost:8080
SECRET_KEY=your_random_secret_string
SESSION_SECRET=your_random_session_secret

# Plaid (sandbox)
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_sandbox_secret
PLAID_ENV=sandbox

# Outlook / Microsoft Graph
MS_CLIENT_ID=your_outlook_app_client_id
MS_CLIENT_SECRET=your_outlook_client_secret
MS_TENANT_ID=consumers
```

##### Frontend `.env`

```bash
VITE_API_BASE=http://localhost:8080
VITE_VAPI_PUBLIC_KEY=your_vapi_public_key
```

Redirect URI in Azure must be: `http://localhost:8080/auth/outlook/callback`. Do **not** commit real secrets.

---

#### **Azure / Outlook (Microsoft Graph)**

1. Go to **Azure Portal → Microsoft Entra ID → App registrations → New registration**.  
2. Set a **Redirect URI (Web)** to:
   - `http://localhost:8080/auth/outlook/callback`  
3. Under **API permissions**, add:
   - `User.Read`  
   - `Mail.ReadWrite`  
   - `Mail.Send`  
   - `Calendars.Read`  
4. Under **Certificates & secrets**, create a **Client secret**.  
5. Copy values into backend `.env`:
   - `MS_CLIENT_ID`  
   - `MS_CLIENT_SECRET`  
   - `MS_TENANT_ID` (keep `consumers` for personal accounts, or use your tenant ID).  

---

#### **Plaid Sandbox**

1. Create a **Plaid Sandbox** account.  
2. Create a new **Sandbox application** and retrieve:
   - `PLAID_CLIENT_ID`  
   - `PLAID_SECRET`  
3. Put them in backend `.env`.  
4. In the UI, use the **Plaid Link** flow to link a **fictional** test bank. You must use these Sandbox credentials (no real bank account):

   | Field    | Value       |
   |----------|-------------|
   | Bank     | Choose any  |
   | Username | `user_good` |
   | Password | `pass_good` |  

---

#### **Vapi**

1. Create a project in the **Vapi** dashboard.  
2. Configure an assistant (the `ASSISTANT_ID` is hard-coded in the frontend).  
3. Copy your **Public Key** and set it in `frontend/.env` as:
   - `VITE_VAPI_PUBLIC_KEY=...`  
4. Rebuild / restart the frontend so the env var is picked up.  

---

**Run the app:** Start backend and frontend, then open the app as in **How to run the demo** above.

---

### Demo persona and data

The persona used in the demo (e.g. **Maya Patel**) is **purely fictional**. It was created for this hackathon to showcase Mimi’s voice-first experience without requiring real bank or email connections.

- **Purpose:** Demonstrate the product with realistic but fake data (emails, transactions, calendar, profile). No real people or accounts are represented.
- **Content:** Profile, emails, transactions, calendar events, and related files live under `backend/personas/` and `frontend/src/demo/` (e.g. `maya_calendar.json`, `maya_email.json`, `maya_financial.json`). All of it is invented for the demo.
- **Privacy:** The repo contains no real user data or PII. When you use your own accounts, Plaid and Outlook data stays in your session and (for Outlook) in a local token cache; it is not stored in the repo or in any dataset.

---

### Known limitations & next steps

- **Single backend instance / in-memory state**
  - Sessions and some token cache state are stored in-memory / local files.  
  - Not horizontally scalable or hardened for production.  

- **Plaid sandbox only**
  - Integration is currently sandbox-only.  
  - No production Plaid environments or webhook handling are wired up.  

- **Outlook-only email and calendar**
  - Gmail, Google Calendar, and other providers are not integrated.  
  - The abstraction exists but only Outlook / Microsoft Graph (Mail + Calendar) is implemented.  

- **Basic auth & security posture**
  - Secrets are read from `.env` and stored locally.  
  - No rate limiting, audit logging, or production-grade security safeguards.  

- **Persona logic & reasoning**
  - Reasoning over persona data is relatively simple and scenario-specific.  
  - Next steps could include richer long-term memory, cross-persona insights, and more robust safety / guardrail layers.  

**Potential next steps:**

- Add **Gmail** (Google Workspace) support alongside Outlook.  
- Move to a **production-ready** deployment stack (Docker, HTTPS, managed secrets).  
- Harden security (rate limiting, CSRF, session store, OAuth best practices).  
- Improve the **persona engine**, including more nuanced reasoning and personalization.  
- Add **multi-user** support and tenant-aware storage for tokens and data.  

