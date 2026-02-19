# Instructor Dashboard

A comprehensive tool for instructors to manage their schedules, raise unavailability or class addition requests, and track their status. Built with a **React** frontend and **FastAPI** backend, using **Google Sheets** as the primary database and **Slack** for real-time notifications.

![Instructor Dashboard](frontend/src/images/logo-web.png)

## 🚀 Features

### for Instructors
- **Dashboard View**: View upcoming and past classes with detailed metadata (attendance, ratings, etc.).
- **Unavailability Requests**: easy form to request time off, with auto-filled class details and multi-select approvers.
- **Class Addition Requests**: Request extra classes with conflict checking and auto-program detection.
- **My Requests**: Track the status (Pending, Approved, Rejected) of all raised requests.
- **Profile**: View personal stats (NPS, Hours Taught) derived from batch metrics.

### for Admins & Operations
- **Google Sheets Integration**: All data is read from and written to Google Sheets, serving as a familiar "CMS".
- **Slack Integration**:
    - **Threaded Notifications**: Requests trigger a main message in a specific channel.
    - **Smart Tagging**: Automatically tags Approvers and CCs (using an ID Mapping sheet) so they get notified.
    - **Rich Context**: Notifications include batch metrics (NPS, reschedules) to aid decision-making.
- **Admin Masquerade**: Admins can "impersonate" any instructor to view the dashboard as them (useful for support).

---

## 🛠️ Architecture

The application is designed to be serverless-friendly (deployable on Vercel) while keeping data manipulation easy for non-technical operations teams (via Google Sheets).

```mermaid
graph LR
    User[Instructor/Admin] -->|HTTPS| Frontend[React SPA\n(Vercel)]
    Frontend -->|/api/*| Backend[FastAPI\n(Vercel Function)]
    Backend -->|Read/Write| GSheets[Google Sheets\n(Database)]
    Backend -->|Notify| Slack[Slack API\n(Bot User)]
```

- **Authentication**: Google OAuth 2.0 (Stateless JWT sessions stored in HTTP-only cookies).
- **Caching**: The backend maintains a short-lived in-memory cache (default 2 mins) of the Sheets data to avoid hitting Google API rate limits.
- **Proxy**: In production (Vercel), usage of `vercel.json` rewrites directs `/api` calls to the backend function, avoiding CORS issues.

---

## 🧩 Tech Stack

- **Frontend**: React, Vite, TypeScript, Vanilla CSS (with variables).
- **Backend**: Python 3.9+, FastAPI, Pydantic, GSpread (Google Sheets API).
- **Infrastructure**: Vercel (Frontend & Backend), Google Cloud Platform (Auth & Sheets API).

---

## ⚡ Setup & Installation

### Prerequisites
1.  **Node.js** (v18+) and **Python** (v3.9+).
2.  **Google Cloud Project**:
    -   Enable **Google Sheets API** and **Google Drive API**.
    -   Create a **Service Account** and download the JSON key.
    -   Create an **OAuth 2.0 Client ID** (for "Web Application").
3.  **Google Sheet**:
    -   Share your "Database" sheet with the Service Account email (`xxx@xxx.iam.gserviceaccount.com`) as *Editor*.
    -   Ensure tabs exist: `upcoming_classes`, `past_classes`, `unavailability_requests`, `class_addition_requests`, `ID mapping`, `batch_metrics`.
4.  **Slack App**:
    -   Create a Slack App, enable **Bots**, and add `chat:write` scope.
    -   Invite the bot to your target channel.

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
# Activate: `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Mac/Linux)

# Install dependencies
pip install -r requirements.txt

# Configure Environment
cp .env.example .env
# Edit .env and fill in:
# - GOOGLE_CLIENT_ID / SECRET
# - GOOGLE_SERVICE_ACCOUNT_FILE (path to your json key)
# - SPREADSHEET_ID
# - SLACK_BOT_TOKEN & SLACK_CHANNEL_ID
# - FRONTEND_URL (http://localhost:5173 for dev)

# Run Dev Server
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure Environment
cp .env.example .env
# Set VITE_API_URL=http://localhost:8000 (direct to backend for local dev)

# Run Dev Server
npm run dev
```

Visit `http://localhost:5173`. Login with a Google account listed in your sheets.

---

## ⚙️ Configuration (Environment Variables)

These variables must be set in your `.env` (local) or Vercel Project Settings.

| Variable | Description | Required? |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Client ID from GCP. | Yes |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret from GCP. | Yes |
| `GOOGLE_CREDENTIALS_JSON` | **Content** of the Service Account JSON (minified). Use this for Vercel. | Prod |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | **Path** to the Service Account JSON (e.g., `service.json`). Use this for Local. | Dev |
| `SPREADSHEET_ID` | The long ID string from your Google Sheet URL. | Yes |
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-...`). | Yes |
| `SLACK_CHANNEL_ID` | Channel ID (`C12345`) where notifications are sent. | Yes |
| `JWT_SECRET` | Random string for signing session cookies. | Yes |
| `FRONTEND_URL` | The URL of the frontend (e.g., `https://myapp.vercel.app`). Used for CORS and Redirects. | Yes |
| `API_BASE_URL` | The URL of the backend (e.g., `https://myapp.vercel.app`). Often same as Frontend on Vercel. | Yes |
| `ADMIN_EMAILS` | Comma-separated emails of admins (enables "Impersonate" button). | Optional |

---

## 📦 Deployment (Vercel)

This repo is set up for **Vercel** deployment. You can deploy it as a monorepo or two separate projects. We recommend a **Single Project** approach using Vercel Rewrites.

### Steps
1.  Push code to GitHub.
2.  Import the repository in Vercel.
3.  **Framework Preset**: Vite (it will detect `frontend`).
4.  **Root Directory**: `frontend` (Override this? **NO**, keep it default or set to root if deploying both).
    *   *Actually, for a combined deploy:* Set Root Directory to `./`. Vercel will pick up `api/` (Python) and build the frontend.
    *   *Alternative (Simpler):* Deploy Frontend pointing to `frontend` folder, and ensure `vercel.json` routes `/api` to the backend.
5.  **Environment Variables**: Paste all variables from the table above.
    *   **Crucial**: For `GOOGLE_CREDENTIALS_JSON`, paste the *text content* of your JSON key file.

### Important: `ID Mapping` Sheet
For Slack tagging to work, your Google Sheet must have a tab named `ID mapping` with these columns:
-   `Name`: (e.g., "John Doe")
-   `Email`: (e.g., "john@example.com")
-   `Member ID`: Slack User ID (`U12345`) or User Group ID (`S12345`).

---

## ❓ Troubleshooting

**Q: 401 Unauthorized after Login?**
-   Check if you are on a Vercel Preview URL. The cookie is explicitly set for the domain in `FRONTEND_URL`. If they don't match, the browser drops the cookie.
-   Ensure `JWT_SECRET` matches on the server.

**Q: Classes not loading?**
-   Check server logs. The "Upcoming Classes" sheet structure must match the code's expected headers.
-   Ensure the Service Account has "Editor" access to the Sheet.

**Q: Slack tags showing as plain text?**
-   Ensure the `Member ID` in the `ID mapping` sheet is correct (starts with `U` or `W` for users, `S` for user groups).
-   The bot must be in the channel to tag others effectively.
