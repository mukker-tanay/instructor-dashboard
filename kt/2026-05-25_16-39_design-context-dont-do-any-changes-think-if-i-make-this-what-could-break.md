# @[c:\Users\Dell\.gemini\antigravity-ide\brain\b010cb9c-ebb3-4680-9f25-2c123cccdea2\design_context.md] DONT DO ANY CHANGES THINK IF I MAKE THIS WHAT COULD BREAK

## Meta
| Field | Value |
|-------|-------|
| Date & Time | 2026-05-25 16:39:07 |
| Action Type | 🔍 Analysed Only |

## Prompt

@[c:\Users\Dell\.gemini\antigravity-ide\brain\b010cb9c-ebb3-4680-9f25-2c123cccdea2\design_context.md] 
DONT DO ANY CHANGES 
THINK IF I MAKE THIS WHAT COULD BREAK

## Files Read / Referenced
- `c:\Users\Dell\.gemini\antigravity-ide\brain\b010cb9c-ebb3-4680-9f25-2c123cccdea2\design_context.md`
- `c:\Users\Dell\Desktop\work\instructor-dashboard\backend\app\models.py`
- `c:\Users\Dell\Desktop\work\instructor-dashboard\backend\app\routers\classes.py`
- `c:\Users\Dell\Desktop\work\instructor-dashboard\backend\app\routers\admin.py`
- `c:\Users\Dell\Desktop\work\instructor-dashboard\backend\app\dependencies.py`
- `c:\Users\Dell\Desktop\work\instructor-dashboard\frontend\src\pages\instructor\InstructorDashboard.tsx`
- `c:\Users\Dell\Desktop\work\instructor-dashboard\frontend\src\pages\admin\AdminDashboard.tsx`
- `c:\Users\Dell\Desktop\work\instructor-dashboard\frontend\src\api\client.ts`

## Files Created / Modified
None

## Summary of What Was Done
Analyzed the proposed design context features (Allowed Instructors Module Mapping and Instructor Breaks & Slot Availability Mapping) against the existing codebase. Identified potential edge cases, database constraints, timezone shifts, null-handling errors, and frontend page crashes that could occur if implemented directly. Presented a comprehensive list of what could break to help guide safe development.

## Key Context
- Option A database array (`text[]`) requires `.cs()` contain queries in Supabase instead of `.eq()`.
- Comma-separated strings (Option B) risk partial matches or trimming bugs.
- Existing allowed instructors have `null` modules, which will crash frontend `.map` loops without proper optional chaining/fallback logic.
- Indefinite breaks with null `end_date` will bypass naive SQL date checks unless explicitly handled.
- Class dates parsed in IST could lead to UTC day-boundary shift mismatch at database layer.
- Updates to instructor preferences must use `upsert` to avoid unique constraint violations on email.
