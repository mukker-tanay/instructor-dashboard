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

To deploy in production (e.g., Render, Heroku):

1. **Credentials**: You cannot upload `service-account.json`. Instead:
    - Open `backend/service-account.json` and copy its entire content.
    - Set the `GOOGLE_CREDENTIALS_JSON` environment variable to this content.
2. **Build Start**: The build might time out if the app fails to connect to Sheets. Ensure `GOOGLE_CREDENTIALS_JSON` is set.

## Architecture

```
Google Sheets → (batched pull every 120s) → FastAPI (in-memory cache) → React UI
Requests: Frontend → FastAPI → Sheets → Slack (async)
```
