# Instructor Dashboard

A comprehensive management tool for instructors to track classes, raise requests, and for admins to review, approve, and track payments. Built with **React** + **TypeScript** frontend, **FastAPI** backend, **Supabase** as the primary database, **Google Sheets** for bookkeeping/reporting, and **Slack Workflows** for real-time notifications.

![Instructor Dashboard](frontend/src/images/logo-web.png)

---

## Features

### For Instructors
- **Dashboard View**: Upcoming and past classes with attendance, ratings, and metadata.
- **Unavailability Requests**: Raise time-off requests with auto-filled class details, multi-select approvers, and context fields (topics covered, batch persona, teaching pace).
- **Class Addition Requests**: Request extra classes with auto-populated program detection and conflict checking.
- **My Requests**: Track status (Pending / Approved / Rejected) of all raised requests. Payment details are intentionally hidden from instructors.
- **Profile**: Personal stats (NPS, Hours Taught) pulled from batch metrics.

### For Admins
- **Admin Dashboard**: View, filter, approve, and reject all requests across both types.
  - **Filters**: Status (Pending / All), Request Type (All / Unavailability / Class Addition), and a **Pending Payment Status** button that highlights approved class additions with `Pending` or `To be Audited` payment status.
- **Class Addition Approval**: Set Payment Status (Sanctioned / Non-sanctioned / Unpaid / To be Audited / Pending), Class Added On (class day / non-class day), and Red Flag Exemption.
- **Unavailability Approval**: Set Final Status, Replacement Instructor, and Red Flag Proof (admin bookkeeping).
- **Bulk Delete**: Select and delete multiple requests at once.
- **Admin Masquerade**: Impersonate any instructor to view the dashboard as them.

---

## Architecture

```mermaid
graph LR
    User[Instructor/Admin] -->|HTTPS| Frontend[React SPA\n(Vercel)]
    Frontend -->|/api/*| Backend[FastAPI\n(Vercel Function)]
    Backend -->|Read/Write| Supabase[(Supabase\nPostgres)]
    Backend -->|Bookkeeping Sync| GSheets[Google Sheets]
    Backend -->|Workflow Webhooks| Slack[Slack Workflow Builder]
```

- **Primary Database**: Supabase (PostgreSQL). All requests and class data live here.
- **Google Sheets**: Used as a bookkeeping/reporting layer. Synced via a cron-triggered `/api/sync` endpoint.
- **Google Sheets Sync**: The sync engine (`sync.py`) pulls class data from Sheets → Supabase, and pushes new/updated requests from Supabase → Sheets (upsert — no duplicate rows on approval).
- **Timestamps**: All timestamps stored as UTC in Supabase but converted to IST (`M/D/YYYY H:MM:SS`) when pushed to Google Sheets.
- **Authentication**: Google OAuth 2.0, stateless JWT sessions in HTTP-only cookies.
- **Slack**: Notifications sent via Slack Workflow Builder webhooks with hardcoded approver Slack IDs.

---

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Vanilla CSS (CSS variables).
- **Backend**: Python 3.11+, FastAPI, Pydantic, Supabase Python SDK, GSpread.
- **Database**: Supabase (PostgreSQL) — `classes`, `unavailability_requests`, `class_addition_requests`, `slack_members`, `slack_groups` tables.
- **Infrastructure**: Vercel (Frontend + Backend functions), Google Cloud Platform (OAuth + Sheets API), Supabase cloud.

---

## Google Sheets Structure

Sheets act as a reporting/bookkeeping layer, not the source of truth. The following tabs are expected:

| Tab Name | Purpose |
|---|---|
| `upcoming_classes` | Synced from Supabase on every `/api/sync` |
| `past_classes` | Synced from Supabase on every `/api/sync` |
| `unavailability_requests` | Pushed from Supabase when requests are created/updated |
| `class_addition_requests` | Pushed from Supabase when requests are created/updated |
| `ID mapping` | Email → Slack Member ID lookup (for mentions) |
| `batch_metrics` | Used to derive NPS and other stats for the Profile page |
| `Slack Member IDs` | Slack member data |
| `Slack Group IDs` | Slack group/usergroup data |

### Class Addition Sheet — Column Order
`instructor_email` → `instructor_name` → `program` → `batch_name` → `class_title` → `module_name` → `date_of_class` → `time_of_class` → `class_type` → `shift_other_classes_by_1` → `assignment_requirement` → `reason_for_addition` → `other_comments` → `select_approver` → `submitted_by` → `time_stamp` *(IST formatted)* → `slack_thread_link` → `actual_date_of_class` → `class_added_on_class_day` → `payment_status` → `slack_link` → `red_flag` → `Request ID` → `status`

---

## Supabase Tables

### `class_addition_requests`
Key columns: `id`, `instructor_email`, `instructor_name`, `program`, `batch_name`, `class_title`, `module_name`, `date_of_class`, `time_of_class`, `class_type`, `reason_for_addition`, `status`, `payment_status`, `class_added_on_class_day`, `red_flag`, `red_flag_proof`, `pushed_to_sheet`, `time_stamp`

### `unavailability_requests`
Key columns: `id`, `instructor_email`, `instructor_name`, `batch_name`, `class_title`, `original_date_of_class`, `reason_for_unavailability`, `status`, `final_status`, `replacement_instructor`, `class_rating_in_case_of_replacement`, `red_flag_proof`, `pushed_to_sheet`, `raised_timestamp`

---

## Setup & Installation

### Prerequisites
1. **Node.js** (v18+) and **Python** (v3.11+).
2. **Supabase Project** with the required tables created.
3. **Google Cloud Project**:
   - Enable **Google Sheets API** and **Google Drive API**.
   - Create a **Service Account** and download the JSON key.
   - Create an **OAuth 2.0 Client ID** (Web Application).
4. **Google Sheet** shared with the Service Account email as *Editor*.
5. **Slack App** with Workflow Builder webhooks configured.

### 1. Backend Setup

```bash
cd backend
python -m venv venv
# Activate: venv\Scripts\activate (Windows) or source venv/bin/activate (Mac/Linux)
pip install -r requirements.txt
cp .env.example .env
# Fill in all required variables (see below)
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_API_URL=http://localhost:8000
npm run dev
```

Visit `http://localhost:5173`.

---

## Environment Variables

| Variable | Description | Required? |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Client ID from GCP | Yes |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret from GCP | Yes |
| `GOOGLE_CREDENTIALS_JSON` | Content of Service Account JSON (minified). Use on Vercel. | Prod |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Path to Service Account JSON. Use locally. | Dev |
| `SPREADSHEET_ID` | Google Sheet ID from the URL | Yes |
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_KEY` | Supabase service role key | Yes |
| `JWT_SECRET` | Random string for signing session cookies | Yes |
| `FRONTEND_URL` | Frontend URL (e.g. `https://myapp.vercel.app`) | Yes |
| `API_BASE_URL` | Backend URL (usually same as Frontend on Vercel) | Yes |
| `ADMIN_EMAILS` | Comma-separated admin emails | Optional |
| `SLACK_UNAVAILABILITY_WEBHOOK_*` | Slack Workflow webhook URLs for unavailability notifications | Yes |
| `SLACK_CLASS_ADDITION_WEBHOOK_*` | Slack Workflow webhook URLs for class addition notifications | Yes |

---

## Sync Engine (`/api/sync`)

The sync endpoint runs on a cron schedule (every 30 mins recommended) and performs:

1. **`pull_classes()`** — Pulls upcoming + past classes from Google Sheets → Supabase (upsert by row hash).
2. **`pull_slack_data()`** — Syncs Slack member and group IDs.
3. **`push_requests()`** — Pushes new/updated requests from Supabase → Google Sheets. Detects existing rows by Request ID and **updates in-place** (no duplicate rows on approval).
4. **`sync_deletions()`** — Removes rows from Sheets that no longer exist in Supabase.
5. **`sync_replacement_ratings()`** — After 48h post-class, auto-fills the replacement instructor's class rating on unavailability requests.

---

## Deployment (Vercel)

1. Push to GitHub and import in Vercel.
2. Set all environment variables in Vercel Project Settings.
3. For `GOOGLE_CREDENTIALS_JSON`, paste the *text content* of your service account JSON file.
4. Configure a cron job to call `GET /api/sync` every 30 minutes.

---

## Troubleshooting

**Q: 401 Unauthorized after Login?**
Check that `FRONTEND_URL` matches the domain in the browser. JWT cookie is domain-scoped.

**Q: Classes not loading?**
Check Supabase connection and ensure the `classes` table has data (run `/api/sync` first).

**Q: Slack notifications not firing?**
Check that the webhook URLs in env vars are correct and that approver Slack IDs are hardcoded in `requests.py`.

**Q: Duplicate rows in Google Sheets?**
Ensure `pushed_to_sheet` column exists on both request tables in Supabase. Run `/api/sync` after any manual Supabase edits.
