## Mimi AI

Mimi AI is a voice-first financial companion that connects to your bank (via Plaid) and your email (via Microsoft Outlook / Graph), then surfaces an AI “Mimi” persona that can talk you through your finances, recent activity, and next steps.

### Quick start

#### **Prerequisites**

- **Node.js**: v20+ (recommended)  
- **npm**: v10+  
- **Python** (optional, only if you also want to run the FastAPI backend prototype): 3.10+  
- A **Microsoft account** (for Outlook / Microsoft Graph delegated login)  
- A **Plaid Sandbox** account  
- A **Vapi** account + public key (for the voice assistant)

---

#### **1. Clone the repo**

```bash
git clone <YOUR_REPO_URL> mimi-ai
cd mimi-ai
```

---

#### **2. Configure backend environment**

From the repo root:

```bash
cd backend

# Create your .env from the example
cp .env.example .env  # On Windows PowerShell: copy .env.example .env
```

Edit `.env` and fill in:

- **Core app**
  - `PORT=8080` (default, can keep)
  - `FRONTEND_ORIGIN=http://localhost:5173`
  - `BACKEND_ORIGIN=http://localhost:8080`
  - `SECRET_KEY` – set to a random long string
  - `SESSION_SECRET` – set to a random long string

- **Plaid (Sandbox)**
  - `PLAID_CLIENT_ID=your_plaid_client_id`
  - `PLAID_SECRET=your_plaid_sandbox_secret`
  - `PLAID_ENV=sandbox`

- **Outlook / Microsoft Graph**
  - `MS_CLIENT_ID=your-outlook-app-client-id`
  - `MS_CLIENT_SECRET=your-outlook-client-secret-value`
  - `MS_TENANT_ID=consumers` (works for consumer accounts; update if you use an org tenant)

> The redirect URI must be set in Azure to:  
> `http://localhost:8080/auth/outlook/callback`

---

#### **3. Install and run the Node backend**

From `backend/`:

```bash
cd backend
npm install
npm run dev
```

- The backend will start on **http://localhost:8080**.
- It exposes:
  - `/api/plaid/*` for Plaid integration
  - `/auth/outlook/*` for Microsoft login
  - `/api/email/*` for Outlook email operations
  - `/health` for health checks

Keep this terminal window running.

---

#### **4. Configure the frontend**

From the repo root:

```bash
cd frontend
```

Create a `.env` file:

```bash
# frontend/.env
VITE_API_BASE=http://localhost:8080
VITE_VAPI_PUBLIC_KEY=your_vapi_public_key
```

- `VITE_API_BASE` must point to the backend origin (by default `http://localhost:8080`).
- `VITE_VAPI_PUBLIC_KEY` comes from your Vapi project.

---

#### **5. Install and run the frontend**

Still in `frontend/`:

```bash
npm install
npm run dev
```

- The frontend runs on **http://localhost:5173**.

---

#### **6. Use the app**

1. Open `http://localhost:5173` in your browser.  
2. **Connect Plaid**:
   - Click the Plaid connect flow.  
   - Use **Plaid Sandbox** credentials to link a test bank account.  
3. **Connect Outlook**:
   - Click the Outlook connect / login button.  
   - You’ll be redirected to Microsoft’s login and consent screen.  
   - Approve the requested scopes (`User.Read`, `Mail.ReadWrite`, `Mail.Send`).  
4. **Start talking to Mimi**:
   - Allow mic permissions in the browser when prompted.  
   - Use the voice controls on the dashboard to start a conversation.  
   - Mimi will use:
     - Plaid data (transactions, balances)  
     - Outlook email context  
     - Synthetic persona data from the backend `personas/` directory  

At this point you have a fully working local demo: Plaid + Outlook + voice assistant over your test data.

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
        |--- Microsoft Graph API (Outlook / Mail)
        |
        |--- Local persona dataset (backend/personas/*)
```

- The **frontend** talks to `http://localhost:8080` for:
  - `/api/plaid/*` (link token, public token exchange, transaction data)
  - `/auth/outlook/*` (login, callback, status)
  - `/api/email/*` (list messages, send email, etc.)
- The **backend**:
  - Stores short-lived session data in server memory / filesystem (`.token_cache`).
  - Manages MSAL auth code flow for Outlook.
  - Calls Plaid sandbox APIs using your sandbox keys.
- **Vapi** runs externally and is called directly from the browser via the `@vapi-ai/web` SDK using `VITE_VAPI_PUBLIC_KEY`.

---

### How to reproduce the demo

#### **1. Environment variables**

##### Backend `.env` (based on `.env.example`)

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

> Do **not** commit real secrets; use a local `.env` and share a redacted `.env.example` (like the existing backend one).

---

#### **2. Azure / Outlook setup**

1. Go to **Azure Portal → Microsoft Entra ID → App registrations → New registration**.  
2. Set a **Redirect URI (Web)** to:
   - `http://localhost:8080/auth/outlook/callback`  
3. Under **API permissions**, add:
   - `User.Read`  
   - `Mail.ReadWrite`  
   - `Mail.Send`  
4. Under **Certificates & secrets**, create a **Client secret**.  
5. Copy values into backend `.env`:
   - `MS_CLIENT_ID`  
   - `MS_CLIENT_SECRET`  
   - `MS_TENANT_ID` (keep `consumers` for personal accounts, or use your tenant ID).  

---

#### **3. Plaid sandbox setup**

1. Create a **Plaid Sandbox** account.  
2. Create a new **Sandbox application** and retrieve:
   - `PLAID_CLIENT_ID`  
   - `PLAID_SECRET`  
3. Put them in backend `.env`.  
4. In the UI, use the **Plaid Link** flow and choose any of the sandbox institutions / credentials provided by Plaid.  

---

#### **4. Vapi setup**

1. Create a project in the **Vapi** dashboard.  
2. Configure an assistant (the `ASSISTANT_ID` is hard-coded in the frontend).  
3. Copy your **Public Key** and set it in `frontend/.env` as:
   - `VITE_VAPI_PUBLIC_KEY=...`  
4. Rebuild / restart the frontend so the env var is picked up.  

---

#### **5. Run end-to-end**

1. **Start backend**: `npm run dev` in `backend/`.  
2. **Start frontend**: `npm run dev` in `frontend/`.  
3. Visit `http://localhost:5173` and:
   - **Option A – Use your own test accounts**  
     - Complete Plaid link with a Plaid Sandbox institution.  
     - Log into Outlook via the app with your Microsoft account.  
     - Start a voice session with Mimi over your own (test) data.  
   - **Option B – Use the built-in demo persona (no login)**  
     - Choose the included demo persona **“Maya Patel”** from the intro/upload flow.  
     - This uses the bundled persona data and demo emails/transactions, so you don’t need to connect Plaid or sign into Outlook.  
     - Start a voice session with Mimi speaking as/with Maya, using only the local demo data.  

This reproduces the complete hackathon demo locally.

---

### Datasets used and their source

The project uses **synthetic persona datasets** checked into the repo under `backend/personas/`:

- **Structure (per persona)**:
  - `persona_profile.json` – high-level profile and traits.  
  - `emails.jsonl` – synthetic email messages.  
  - `transactions.jsonl` – synthetic financial transactions.  
  - `lifelog.jsonl` – time-series life events.  
  - `social_posts.jsonl` – synthetic social media activity.  
  - `calendar.jsonl` – synthetic calendar events.  
  - `files_index.jsonl` – references to hypothetical files.  
  - `consent.json` – consent metadata for the persona.  
  - `README.md` – persona-specific notes.  

**Source & privacy notes:**

- All persona data is **synthetic**, created partly by the project team for this hackathon and partly provided by the hackathon organizers specifically for this use case.  
- No real user data, PII, or production account data is included in the repo.  
- Live data only comes from:
  - **Plaid Sandbox** accounts (test-only).  
  - Your own **Outlook** account via Microsoft Graph, used locally and stored in a local token cache.  

---

### Known limitations & next steps

- **Single backend instance / in-memory state**
  - Sessions and some token cache state are stored in-memory / local files.  
  - Not horizontally scalable or hardened for production.  

- **Plaid sandbox only**
  - Integration is currently sandbox-only.  
  - No production Plaid environments or webhook handling are wired up.  

- **Outlook-only email provider**
  - Gmail or other providers are not integrated.  
  - The abstraction exists but only Outlook / Microsoft Graph is implemented.  

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

