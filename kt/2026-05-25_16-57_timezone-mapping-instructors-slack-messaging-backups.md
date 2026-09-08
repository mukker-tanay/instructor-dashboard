# DONOT DO ANY CHANGES THIS LIST OF INSTRUCTORS WITH BREAK MAPPING... WOULD ALSO NEED TO MAP IF THEY ARE IN A DIFFERENT TIMEZONE...

## Meta
| Field | Value |
|-------|-------|
| Date & Time | 2026-05-25 16:57:10 |
| Action Type | 🔍 Analysed Only |

## Prompt

DONOT DO ANY CHANGES
THIS LIST OF INSTRUCTORS WITH BREAK MAPPING MODULE MAPPING AND AVAILABILITY MAPPING WOULD BE USED TO MAP BACKUPS ( ALREADY IN PROCESS BY ANOTHER TEAM MEMBER) -- THIS LIST WOULD THEN BE USED TO GO FOR AUTOMATED SLACK MESSAGING TO CHECK WITH THEM AND SOMETIMES CALL THEM.

WOULD ALSO NEED TO MAP IF THEY ARE IN A DIFFERENT TIMEZONE(NOT IN INDIA).(CAN THIS BE DONE AUTOMATICALLY?)

## Files Read / Referenced
- `c:\Users\Dell\Desktop\work\instructor-dashboard\backend\app\slack.py`
- `c:\Users\Dell\Desktop\work\instructor-dashboard\backend\app\routers\requests.py`

## Files Created / Modified
- `c:\Users\Dell\Desktop\work\instructor-dashboard\kt\2026-05-25_16-57_timezone-mapping-instructors-slack-messaging-backups.md` (Created log file for current turn)

## Summary of What Was Done
Analyzed the user's requirement to automatically map timezone information (non-India status) for instructors to support automated Slack outreach and backup matching. Outlined three fully automated technical solutions (Slack API profile metadata, browser Intl geolocation, and phone country-code heuristics), along with design considerations for integrating these rules into their automated calling/messaging stack.

## Key Context
- Slack API provides fully automated, accurate `tz` (timezone name) and `tz_offset` (seconds relative to UTC) information in user profile lookups.
- React frontend can passively retrieve the browser timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone` and write it to the database during login.
- Timezone information is critical for automated backup messaging to prevent sending alerts during an instructor's local quiet hours (sleeping times) or calling foreign phone numbers during local nights.
