# Instructor Dashboard Feature Specifications

This document preserves the context, requirements, and technical design schemas discussed in the current session. **No code modifications were made in the codebase, per direct request.**

---

## 1. Feature: Allowed Instructors Module Mapping

### Goal
Provide admins the capability to specify which academic modules each instructor is permitted to teach when giving them access to the dashboard.

### Database Design (Supabase/PostgreSQL)
We can alter the existing `allowed_instructors` table.

```sql
-- Option A: PostgreSQL text array column (Highly Recommended for filtering)
ALTER TABLE allowed_instructors ADD COLUMN modules text[] DEFAULT '{}';

-- Option B: Simple text column (Comma-separated)
ALTER TABLE allowed_instructors ADD COLUMN modules text;
```

### Stack Integration
1. **Supabase client**: Standard fetch/insert statements naturally support lists as arrays (Option A) or strings (Option B).
2. **FastAPI (`backend/app/routers/admin.py`)**:
   - Update `AllowedInstructorCreate` or create an update schema.
   - Adjust database operations to pull and write the `modules` array.
3. **React (`frontend/src/pages/admin/AdminDashboard.tsx`)**:
   - Display mapped modules as tags next to the instructor's email.
   - Add a modal component for editing these modules (modeled after the existing Alias modal).

---

## 2. Feature: Instructor Backup Availability (Standby) Mapping

### Goal
Enable instructors to proactively declare when they are available to take **backup/replacement classes** (standby slots) and set their general time-of-day teaching preferences. This allows the admin/operations team to instantly match and assign qualified backup instructors when unavailability requests are raised.

### Database Schema Design

#### A. `backup_availability` Table
Stores specific dates or date ranges when instructors are available to standby for backup classes.

| Column Name | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | `gen_random_uuid()` |
| `instructor_email` | `text` | Indexed; represents the instructor |
| `start_date` | `date` | Start date of backup availability |
| `end_date` | `date` | End date (same as start_date for single-day standby) |
| `slot` | `text` | `'morning'`, `'evening'`, or `'both'` for this specific window |
| `status` | `text` | `'active'` (available) or `'assigned'` (if selected for a class) |
| `notes` | `text` | Nullable; additional context (e.g., "Available for advanced topics") |
| `created_at` | `timestamptz` | `default: now()` |

#### B. `instructor_slot_preferences` Table
Stores general weekly availability preferences.

| Column Name | Type | Notes |
|---|---|---|
| `instructor_email` | `text` (PK) | Unique instructor identifier |
| `general_preference` | `text` | `'morning'`, `'evening'`, `'both'`, or `'none'` |
| `notes` | `text` | Nullable; custom scheduling preferences |
| `updated_at` | `timestamptz` | `default: now()` |

---

### Backend API Design (`backend/app/routers/availability.py`)

A new router file containing the following endpoints:

#### Instructor Side:
* **`GET /api/availability/me`**: Get logged-in instructor's standby slots and slot preferences.
* **`POST /api/availability/standby`**: Declare new backup availability (standby slots).
* **`DELETE /api/availability/standby/{id}`**: Remove a declared standby slot.
* **`PUT /api/availability/preferences`**: Update general morning/evening slot preference.

#### Admin Side:
* **`GET /api/admin/availability/active-standbys`**: Get a list of all instructors who have declared standby availability for a given date range and slot.
* **`GET /api/admin/availability/recommendations`**: Fetch recommended replacement instructors for a specific class (sorted by standby status, program fit, and preferences).

---

### Frontend Dashboard Design (React)

#### A. Instructor View (New Tab: "Backup & Availability")
1. **General Teaching Preference Card**:
   - Sleek radio options or toggles:
     - 🌅 **Morning Slots** (e.g., 7 AM - 12 PM)
     - 🌇 **Evening Slots** (e.g., 6 PM - 10 PM)
     - 🔄 **Both**
     - 🛑 **None** (Not open to new classes/backups)
2. **Offer Backup Standby Form**:
   - Simple date picker / date range picker.
   - Slot selector: `[Morning]`, `[Evening]`, `[Both]`.
   - Action Button: `"Opt-in as Backup"`.
3. **My Standby Slots List**:
   - Shows active standby declarations.
   - Displays status badges: `Active (Awaiting Class)` or `Assigned (Backup Class Confirmed)`.

#### B. Admin Integration (Smart Replacement Selection)
When an admin views a pending class unavailability request (e.g., for Class X on June 15 Evening):
- The replacement dropdown is sorted to prioritize matching backups:
  1. ⭐ **Standby matches**: Instructors who explicitly marked themselves as "Standby" for June 15 Evening.
  2. 👍 **Preferred matches**: Instructors who generally prefer Evening slots and have no schedule conflicts.
  3. ⚠️ **Conflicts**: Instructors with conflicts or who prefer Morning slots.

