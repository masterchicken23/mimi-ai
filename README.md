## Mimi AI

Mimi AI is a voice-first companion designed for people living with Parkinson's. It connects to your bank (via Plaid), your email, and your calendar (via Microsoft Outlook / Graph), then surfaces an AI “Mimi” persona that can talk you through your finances, calendar, recent activity, and next steps so you can stay on top of things by speaking, not typing or tapping.

---
!!!!!! 🐿️🐿️🐿️🐿️🐿️🐿️
## Live deployment: https://mimi-ai-nu.vercel.app/
!!!!!! 🐿️🐿️🐿️🐿️🐿️🐿️


### How to run the demo

You will **clone the repo, configure your own `.env` files, and then choose between the demo persona or a live Sandbox experience**.

!!!! For local deployment, choose DEMO track when selecting your experience !!!!

#### Prerequisites

- **Node.js**: v20+  
- **npm**: v10+  
- A **Plaid Sandbox** account (for bank data)  
- A **Microsoft account** (for Outlook / Microsoft Graph)  
- A **Vapi** account + public key (for the voice assistant)

The sections **Environment variables and API keys** below explain which keys you need from each provider.

---

#### Step 1: Clone the repo

```bash
git clone <YOUR_REPO_URL> mimi-ai
cd mimi-ai
```

---

#### Step 2: Configure environment variables

1. **Backend (`backend/.env`)**
   - From the project root:
     ```bash
     cd backend
     cp .env.example .env   # or copy .env.example .env on Windows
     ```
   - Edit `backend/.env` and fill in:
     - Core app settings (`PORT`, `FRONTEND_ORIGIN`, `BACKEND_ORIGIN`, `SECRET_KEY`, `SESSION_SECRET`)  
     - Plaid Sandbox keys (`PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`)  
     - Outlook / Microsoft Graph keys (`MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`)  
   - See **Environment variables and API keys** for exact values and where to get them.

2. **Frontend (`frontend/.env`)**
   - From the project root:
     ```bash
     cd frontend
     ```
   - Create a file `frontend/.env`:
     ```bash
     VITE_API_BASE=http://localhost:8080
     VITE_VAPI_PUBLIC_KEY=your_vapi_public_key
     ```
   - `VITE_VAPI_PUBLIC_KEY` comes from your Vapi project (see the Vapi section below).

---

#### Step 3: Start the backend

From the project root:

```bash
cd backend
npm install
npm run dev
```

Leave this terminal open. When it’s ready, you’ll see the backend listening at **http://localhost:8080**. The server will stay running until you stop it (e.g. Ctrl+C).

---

#### Step 4: Start the frontend

Open a **second** terminal. From the project root:

```bash
cd frontend
npm install
npm run dev
```

When it’s ready, the frontend will be available at **http://localhost:5173**. Keep this terminal open as well.

---

#### Step 5: Open the app and choose your experience

1. In your browser, go to **http://localhost:5173**.  
2. On the welcome screen, choose how you want to explore Mimi:

   **Option A – Demo persona (no login)**  
   - Select **Maya Patel** from the intro flow.  
   - No Plaid or Outlook sign-in required.  
   - Mimi uses bundled fictional data (emails, transactions, calendar).  
   - Example voice prompt: *"What's my next calendar appointment?"*

   **Option B – Connect Plaid and Outlook (Sandbox)**  
   - **Plaid:** Click to connect, then use the **fictional** Sandbox credentials in the Plaid Link UI:  
     - **Username:** `user_rodrigo`  
     - **Password:** `pass_good`  
     - **Bank:** choose any  
   - **Outlook:** Connect and sign in with your Microsoft account.  
   - Mimi will use that account's email and calendar plus the Plaid sandbox data.

3. When you start a voice session, **allow microphone access** in the browser so Mimi can hear you.

That’s the full demo running from a fresh clone.

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

Use this section when filling out `backend/.env` and `frontend/.env` in **Step 2: Configure environment variables** above.

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
4. In the UI, use the **Plaid Link** flow in the app to link a **fictional** test bank. You must use these Sandbox credentials (no real bank account):

   | Field    | Value       |
   |----------|-------------|
   | Bank     | Choose any  |
   | Username | `user_rodrigo` |
   | Password | `pass_good` |  

---

#### **Vapi**

1. Create a project in the **Vapi** dashboard.  
2. Configure an assistant (the `ASSISTANT_ID` is hard-coded in the frontend).  
3. Copy your **Public Key** and set it in `frontend/.env` as:
   - `VITE_VAPI_PUBLIC_KEY=...`  
4. Rebuild / restart the frontend so the env var is picked up.  

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

