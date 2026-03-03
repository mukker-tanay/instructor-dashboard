# Supabase Migration Plan

## Overview

Replace Google Sheets as the **real-time operational database** with Supabase (PostgreSQL). The backend will read/write exclusively to Supabase during normal operation. Google Sheets becomes a **periodic sync destination** for the operations team.

### Current Architecture
```
Instructor Dashboard ──→ Vercel Backend ──→ Google Sheets API (rate-limited to 60 reads/min)
                                         ←── Cache refreshes every 5 min
```

### Target Architecture
```
Instructor Dashboard ──→ Vercel Backend ──→ Supabase (unlimited reads/writes)
                                              │
                              ┌────────────────┴────────────────┐
                              ↓ (hourly pull)                   ↓ (hourly push)
                        Google Sheets                     Google Sheets
                     (class data dump)               (requests + approvals)
```

---

## Phase 1: Supabase Setup

### Database Schema

#### `classes` table
| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` (PK, auto) | Internal ID |
| `instructor_name` | `text` | |
| `instructor_email` | `text` | Indexed for filtering |
| `class_date` | `text` | Stored as-is from sheet (MM/DD/YYYY) |
| `class_day` | `text` | |
| `class_time` | `text` | |
| `class_title` | `text` | |
| `module_name` | `text` | |
| `sb_names` | `text` | Batch name(s) |
| `program_name` | `text` | |
| `class_type` | `text` | Regular / Optional |
| `class_rating` | `text` | Nullable |
| `class_category` | `text` | `upcoming` or `past` |
| `sheet_row_hash` | `text` | Hash of key fields for dedup during sync |
| `synced_at` | `timestamptz` | Last sync timestamp |

#### `unavailability_requests` table
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | Same as `request_id` |
| `instructor_name` | `text` | |
| `instructor_email` | `text` | |
| `batch_name` | `text` | |
| `class_title` | `text` | |
| `class_date` | `text` | |
| `class_time` | `text` | |
| `reason` | `text` | |
| `topics_covered` | `text` | |
| `batch_pulse` | `text` | |
| `teaching_pace` | `text` | |
| `suggested_replacement` | `text` | |
| `status` | `text` | `Pending` / `Approved` / `Rejected` |
| `admin_notes` | `text` | |
| `approved_by` | `text` | |
| `created_at` | `timestamptz` | |
| `pushed_to_sheet` | `boolean` | `false` until hourly sync pushes it |

#### `class_addition_requests` table
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | |
| `instructor_name` | `text` | |
| `instructor_email` | `text` | |
| `batch_name` | `text` | |
| `module_name` | `text` | |
| `class_title` | `text` | |
| `class_date` | `text` | |
| `class_time` | `text` | |
| `class_type` | `text` | |
| `shift_other_classes` | `text` | |
| `assignment_homework` | `text` | |
| `reason` | `text` | |
| `program_name` | `text` | |
| `status` | `text` | `Pending` / `Approved` / `Rejected` |
| `admin_notes` | `text` | |
| `approved_by` | `text` | |
| `created_at` | `timestamptz` | |
| `pushed_to_sheet` | `boolean` | |

#### `slack_members` table
| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` (PK, auto) | |
| `name` | `text` | |
| `member_id` | `text` | Slack user ID |
| `email` | `text` | |

#### `batch_metrics` table
| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` (PK, auto) | |
| `sb_names` | `text` | Indexed |
| All other metric columns | `text` | Mirrors the sheet |

---

## Phase 2: Backend Refactoring

### New file: `supabase_client.py`
- Initialize the Supabase Python client using `SUPABASE_URL` and `SUPABASE_KEY` from `.env`
- Expose a singleton `supabase` client instance

### Modify: `routers/classes.py`
- Replace `cache.classes` reads → `supabase.table("classes").select("*").eq("instructor_email", email).execute()`
- Filter upcoming/past using the `class_category` column
- No more in-memory cache needed for classes

### Modify: `routers/requests.py`
- Replace `sheets_service.append_row()` → `supabase.table("unavailability_requests").insert({...}).execute()`
- Replace `sheets_service.append_row()` → `supabase.table("class_addition_requests").insert({...}).execute()`
- **Slack webhook calls stay exactly where they are** — no changes needed
- Duplicate checking queries Supabase instead of cache

### Modify: `routers/admin.py`
- Replace `sheets_service.update_cells()` → `supabase.table("...").update({"status": "Approved"}).eq("id", request_id).execute()`
- Replace `sheets_service.find_row_by_value()` → Supabase query by `id`
- Locking logic (`locked_by`, `locked_at`) moves to Supabase columns with proper row-level updates

### Remove/Simplify: `cache.py`
- The in-memory `CacheManager` with background refresh is **no longer needed**
- Can be removed entirely or kept as a thin pass-through

### Keep: `sheets.py`
- Still needed for the hourly sync job (Phase 3)
- No longer called during normal API request handling

---

## Phase 3: Sync Engine (Hourly Cron)

### New file: `sync.py`

#### Job 1: Pull (Google Sheets → Supabase)
Runs every hour. Fetches fresh class data from Google Sheets and upserts into Supabase.

```
1. Fetch upcoming_classes + past_classes from Google Sheets
2. For each row, compute a hash of (email + date + time + title + batch)
3. UPSERT into Supabase `classes` table using hash as conflict key
4. Delete any Supabase rows that no longer exist in the sheet (optional)
```

#### Job 2: Push (Supabase → Google Sheets)
Runs every hour. Pushes any new/updated requests to Google Sheets.

```
1. Query Supabase: SELECT * FROM unavailability_requests WHERE pushed_to_sheet = false
2. Append each row to the Google Sheet
3. UPDATE pushed_to_sheet = true in Supabase
4. Same for class_addition_requests
```

### Running the Cron

**Option A: Supabase pg_cron + Edge Function (Recommended)**
- Free on all plans
- Create a Supabase Edge Function that runs the sync logic
- Schedule it via `pg_cron` in Supabase Dashboard

**Option B: External cron (cron-job.org)**
- Free service that pings a `/api/sync` endpoint on your Vercel backend every hour

**Option C: Vercel Cron (Pro plan only for hourly)**
- Add to `vercel.json`: `{ "crons": [{ "path": "/api/sync", "schedule": "0 * * * *" }] }`

---

## Phase 4: Environment & Dependencies

### New `.env` variables
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key
```

### New Python dependency
```
pip install supabase
```

---

## Data Ownership Rules

| Data | Owner (Source of Truth) | Direction |
|---|---|---|
| Classes (upcoming/past) | Google Sheets | Sheets → Supabase (pull) |
| Unavailability Requests | Supabase | Supabase → Sheets (push) |
| Class Addition Requests | Supabase | Supabase → Sheets (push) |
| Admin Approvals/Rejections | Supabase | Supabase → Sheets (push) |
| Post-approval manual edits | Google Sheets | One-way, no sync back needed |

---

## Migration Steps (Execution Order)

1. **Create Supabase project** and define all tables above
2. **Run initial data load**: one-time script to pull all existing Google Sheet data into Supabase
3. **Add `supabase_client.py`** to the backend
4. **Refactor `routers/requests.py`** to write to Supabase (keep Slack calls unchanged)
5. **Refactor `routers/classes.py`** to read from Supabase
6. **Refactor `routers/admin.py`** to update Supabase
7. **Build `sync.py`** with pull/push logic
8. **Set up the hourly cron** (Supabase Edge Function or external)
9. **Test end-to-end**: raise request → appears in Supabase instantly → syncs to Sheet within the hour
10. **Remove `cache.py`** background refresh (no longer needed)

---

## Verification Plan

- [ ] Instructor raises unavailability → row appears in Supabase instantly
- [ ] Slack notification fires correctly (unchanged)
- [ ] Admin approves → status updates in Supabase instantly
- [ ] Hourly sync pushes new requests to Google Sheet
- [ ] Hourly sync pulls new class data from Google Sheet into Supabase
- [ ] No Google Sheets API calls during normal dashboard usage
- [ ] Post-approval manual sheet edits are unaffected
