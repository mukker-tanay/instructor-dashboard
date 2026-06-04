# Phase 0 — Recon Report (Backup & Availability)

**Date:** 2026-06-03  
**Scope:** Read-only verification before further multi-date work. **No application code was changed.**

---

## 1. Calendar UI state (`BackupAvailability.tsx`)

| Check | Result |
|-------|--------|
| `popupDay` (legacy single-date) | **Not present** in repo (only mentioned in planning docs / Antigravity transcript) |
| `selectedDays: Set<string>` | **Present** (line ~84) |
| `toggleDay` / `clearSelection` | **Implemented** |
| Multi-date side panel | **Implemented** (“N dates selected”, list, slot radios, batch submit) |
| `handleSubmit` | **Batch:** `Promise.all` → `createStandbySlot` per eligible date |
| Month navigation clears selection? | **No** — `prevMonth` / `nextMonth` only change `viewYear` / `viewMonth` |

**Conclusion:** Phases **1–3 from [tasks.md](../tasks.md) are already implemented in source**. If production still feels “one date at a time,” likely causes are:

1. **Deploy lag** — live build predates this `BackupAvailability.tsx`.
2. **UX confusion** — user must click **multiple** days then use the side panel (not a per-day popup).
3. **Browser cache** — stale JS bundle.

**Recommended manual check (staging or prod):**

1. Log in as instructor → **Backup & Availability** (`/instructor/availability`).
2. Click **two or more** future dates → panel should show “2 dates selected”.
3. Choose slot → **Opt-in for N dates** → confirm rows in **My Standby Slots**.

---

## 2. Integration map (unchanged surfaces)

| Surface | File | Risk if availability changes |
|---------|------|------------------------------|
| Route | `frontend/src/App.tsx` → `/instructor/availability` | Low — route stable |
| Nav | `frontend/src/components/Header.tsx` | Low |
| API client | `frontend/src/api/client.ts` | Low — same endpoints |
| Backend router | `backend/app/routers/availability.py` | Low — registered in `main.py` |
| Admin replacement dropdown | `frontend/src/pages/admin/AdminDashboard.tsx` | **Read-only** consumer of `getAdminAvailabilityAll()`; batch create still writes same table shape |
| Other instructor pages | Dashboard, Unavailability, etc. | **No dependency** on backup calendar |

Multi-date opt-in does **not** require schema or API contract changes for MVP (multiple `POST /standby` calls).

---

## 3. Automated checks (this environment)

| Check | Result |
|-------|--------|
| `python -m py_compile app/routers/availability.py` | **Pass** |
| `check_availability_tables.py` | **Not run** — venv missing `python-dotenv`; run on a machine with backend `.env` configured |
| `npx tsc --noEmit` | **Not run** — Node/npx not on PATH in agent shell |
| `popupDay` grep | **No matches** in application code |

**Run before next deploy (your machine / CI):**

```powershell
cd backend
.\venv\Scripts\pip install -r requirements.txt   # if needed
.\venv\Scripts\python check_availability_tables.py

cd ..\frontend
npm run build
```

---

## 4. Live-safety notes (pre-existing, not introduced in Phase 0)

These are worth knowing before changing this page; **no fixes applied in Phase 0.**

1. **`todayISO` uses UTC** (`new Date().toISOString().split('T')[0]`) — in IST-heavy usage, “today” near midnight UTC can disagree with local calendar for borderline dates.
2. **No server-side duplicate guard** — submitting the same date+slot twice can create duplicate `backup_availability` rows (Phase 4 bulk API addresses this).
3. **`fetchData()` after submit sets `loading: true`** — full-page spinner briefly; existing behavior.
4. **Partial batch errors** — `skipped` in success banner may count both class-blocked and API-failed dates; messaging is approximate.

None of these block shipping multi-select; they are follow-ups.

---

## 5. Database tables

Expected tables (from Antigravity / `check_availability_tables.py`):

- `backup_availability`
- `instructor_slot_preferences`

**Action for ops:** Confirm both exist in production Supabase (SQL editor or run `check_availability_tables.py` with valid credentials). If missing, availability page API calls return 500 — **fix migration before any UI deploy**.

---

## 6. Phase 0 decision

| Item | Status |
|------|--------|
| Phase 0 recon | **Complete** |
| Safe to change product code? | **Only after** manual QA confirms live vs repo; prefer **deploy current branch** if QA passes |
| Next recommended step | **Manual QA** on staging → if multi-select works, close Phases 1–3 in tasks.md; if not, compare deployed commit to `BackupAvailability.tsx` |
| Next code phase (if gaps found) | Phase 4 (bulk API + duplicate skip) or Phase 5 (UX polish) — **not** re-implement Phase 1–3 from scratch |

---

## 7. Sign-off checklist

- [x] Read `BackupAvailability.tsx` — multi-select confirmed in source
- [x] No `popupDay` in codebase
- [x] Backend router compiles and is mounted
- [ ] Supabase tables verified in **production** (manual — agent could not reach DB)
- [ ] `npm run build` on deploy pipeline (manual — Node unavailable in agent shell)
- [ ] Instructor multi-click QA on **live/staging** (manual)
