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
*Unifies both upcoming_classes & past_classes into one tracked table*
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | Auto-generated |
| `sbat_group_id` | `text` | |
| `instructor_email` | `text` | Indexed for filtering |
| `instructor_name` | `text` | |
| `program` | `text` | |
| `sb_names` | `text` | |
| `module_name` | `text` | |
| `class_topic` | `text` | |
| `class_date` | `text` | |
| `time_of_day` | `text` | |
| `class_type` | `text` | |
| `class_rating` | `text` | Exists in past_classes only |
| `class_category` | `text` | `upcoming` or `past` (backend flag) |
| `sheet_row_hash` | `text` | Hash of key fields for dedup during sync |
| `synced_at` | `timestamptz` | Last sync timestamp |

#### `unavailability_requests` table
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | Same as `request_id` |
| `instructor_email` | `text` | |
| `instructor_name` | `text` | |
| `program` | `text` | |
| `batch_name` | `text` | |
| `sbat_group_id` | `text` | |
| `module_name` | `text` | |
| `class_title` | `text` | |
| `original_date_of_class` | `text` | MM/DD/YYYY |
| `original_time_of_class` | `text` | HH:MM AM/PM IST |
| `class_type` | `text` | |
| `reason_for_unavailability`| `text` | |
| `any_other_comments`| `text` | |
| `suggested_instructors_for_replacement`| `text` | |
| `topics_and_promises` | `text` | From Previous Class |
| `batch_pulse_persona` | `text` | |
| `recommended_teaching_pace`| `text` | & Style |
| `raised_timestamp` | `timestamptz` | |
| `raised_by` | `text` | |
| `slack_thread_link` | `text` | |
| `final_status` | `text` | Instructor chge / Reschedule class day / Non-class day |
| `replacement_instructor` | `text` | |
| `class_rating_in_case_of_replacement`| `text` | |
| `ri_taking_the_class` | `text` | |
| `red_flag_proof` | `text` | "If request has to be considered..." |
| `status` | `text` | pending / approved / rejected |
| `locked_by` | `text` | |
| `locked_at` | `timestamptz` | |
| `pushed_to_sheet` | `boolean` | `false` until hourly sync pushes it |

#### `class_addition_requests` table
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | Same as `request_id` |
| `instructor_email` | `text` | |
| `instructor_name` | `text` | |
| `program` | `text` | |
| `batch_name` | `text` | |
| `class_title` | `text` | |
| `module_name` | `text` | |
| `date_of_class` | `text` | MM/DD/YYYY |
| `time_of_class` | `text` | HH:MM AM/PM IST |
| `class_type` | `text` | Regular/Optional |
| `shift_other_classes_by_1` | `text` | Yes/No |
| `contest_impact` | `text` | Will this addition affect... |
| `assignment_requirement`| `text` | Requirement of Assignment... |
| `reason_for_addition`| `text` | |
| `other_comments` | `text` | |
| `select_approver` | `text` | |
| `submitted_by` | `text` | |
| `time_stamp` | `timestamptz` | |
| `slack_thread_link` | `text` | |
| `actual_date_of_class` | `text` | |
| `class_added_on_class_day`| `text` | Class Added on Class Day/Non-Class Day... |
| `slack_link` | `text` | |
| `red_flag` | `text` | |
| `status` | `text` | pending / approved / rejected |
| `locked_by` | `text` | |
| `locked_at` | `timestamptz` | |
| `rejection_reason` | `text` | |
| `pushed_to_sheet` | `boolean` | `false` until hourly sync pushes it |

#### `slack_members` table
| Column | Type | Notes |
|---|---|---|
| `id` | `text` (PK) | Raw Slack ID |
| `email` | `text` | |
| `name` | `text` | |

#### `slack_groups` table
| Column | Type | Notes |
|---|---|---|
| `usergroup_id` | `text` (PK) | Raw Slack Group ID |
| `handle` | `text` | |
| `name` | `text` | |
| `tag` | `text` | |

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
