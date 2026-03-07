import sys
import re

file_path = "backend/app/routers/requests.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 6. /unavailability-requests Slack lookup Replacement
old_slack_u = """        # Look up raw Slack ID for suggested_replacement from cached Slack member IDs
        def get_slack_id(name: str) -> str:
            \"\"\"Return raw Slack member ID for a name, or empty string if not found.\"\"\"
            if not name:
                return ""
            clean = name.strip().lower()
            for r in cache.slack_members:
                if str(r.get("name", "")).strip().lower() == clean:
                    return str(r.get("id", "")).strip()
            return ""

        suggestion_id = get_slack_id(body.suggested_replacement)"""

new_slack_u = """        # Look up raw Slack ID for suggested_replacement from Supabase Slack members
        def get_slack_id(name: str) -> str:
            \"\"\"Return raw Slack member ID for a name, or empty string if not found.\"\"\"
            if not name:
                return ""
            try:
                res = supabase.table("slack_members").select("id").ilike("name", f"%{name.strip()}%").execute()
                if res.data and len(res.data) > 0:
                    return str(res.data[0].get("id", "")).strip()
            except Exception as e:
                print(f"[ERROR] Slack ID lookup failed: {e}")
            return ""

        suggestion_id = get_slack_id(body.suggested_replacement)"""
content = content.replace(old_slack_u, new_slack_u)

# 7. /class-addition-requests Slack lookup Replacement
old_slack_c = """    # â”€â”€â”€ Slack Workflow Notification â”€â”€â”€
    # Look up the approver's raw Slack user ID from cached Slack Member IDs
    def get_slack_id(name: str) -> str:
        \"\"\"Return raw Slack member ID for a name, or empty string if not found.\"\"\"
        if not name:
            return ""
        clean = name.strip().lower()
        for r in cache.slack_members:
            if str(r.get("name", "")).strip().lower() == clean:
                return str(r.get("id", "")).strip()
        return ""

    approver_id = get_slack_id(body.approver)"""

new_slack_c = """    # â”€â”€â”€ Slack Workflow Notification â”€â”€â”€
    # Look up the approver's raw Slack user ID from Supabase Slack Member IDs
    def get_slack_id(name: str) -> str:
        \"\"\"Return raw Slack member ID for a name, or empty string if not found.\"\"\"
        if not name:
            return ""
        try:
            res = supabase.table("slack_members").select("id").ilike("name", f"%{name.strip()}%").execute()
            if res.data and len(res.data) > 0:
                return str(res.data[0].get("id", "")).strip()
        except Exception as e:
            print(f"[ERROR] Slack ID lookup failed: {e}")
        return ""

    approver_id = get_slack_id(body.approver)"""
content = content.replace(old_slack_c, new_slack_c)

import builtins
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("done rewriting slack loop payload")
