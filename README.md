# Instructor Dashboard MVP

Internal tool for instructors to manage classes and raise requests, and for admins to approve/reject them. Powered by Google Sheets as the sole datastore.

## Quick Start

### Backend (FastAPI)

```bash
cd backend
python -m venv venv
venv\Scripts\activate       # Windows
pip install -r requirements.txt

# Copy .env.example to .env and fill in your credentials
copy .env.example .env

uvicorn app.main:app --reload --port 8000
```

### Frontend (React + TypeScript)

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` and proxies API calls to `http://localhost:8000`.

## Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Path to service account JSON key (Development) |
| `GOOGLE_CREDENTIALS_JSON` | Content of service account JSON key (Production) |
| `SPREADSHEET_ID` | Google Sheets spreadsheet ID |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL |
| `JWT_SECRET` | Random secret for JWT signing |
| `FRONTEND_URL` | Frontend URL (default: `http://localhost:5173`) |
| `ADMIN_EMAILS` | Comma-separated list of admin email addresses |

## Deployment

### Backend (Cloudflare Workers)

The backend is deployed on Cloudflare Workers (e.g., `*.workers.dev`).

1.  **Environment Variables**:
    -   Ensure `GOOGLE_CREDENTIALS_JSON` is set in your Worker settings (Settings -> Variables).
    -   Value should be the content of `backend/service-account.json`.

2.  **Service URL**:
    -   Note your Worker URL (e.g., `https://instructor-dashboard-backend.tanay-mukker.workers.dev`).
    -   **Important**: The API base path is likely `/api`, so your full connection string for the frontend will be `https://<YOUR_WORKER_URL>/api`.

### Frontend (Vercel)

1.  **New Project**: Import the repository into Vercel.
2.  **Build Settings**:
    -   **Framework Preset**: Vite
    -   **Root Directory**: `frontend` (if the repo root is not the frontend root)
    -   **Build Command**: `npm run build`
    -   **Output Directory**: `dist`
3.  **Environment Variables**:
    -   Add `VITE_API_URL`.
    -   **Value**: `https://<YOUR_WORKER_URL>/api` (e.g., `https://instructor-dashboard-backend.tanay-mukker.workers.dev/api`).
    -   Redeploy for changes to take effect.

## Architecture

```
Google Sheets → (batched pull every 120s) → FastAPI (in-memory cache) → React UI
Requests: Frontend → FastAPI → Sheets → Slack (async)
```
