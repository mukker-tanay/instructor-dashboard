import sys
sys.path.append('.')
from dotenv import load_dotenv
load_dotenv()

from app.supabase_client import supabase

def check_tables():
    if not supabase:
        print("[ERROR] Supabase client is not initialized. Check your .env credentials.")
        return

    print("Checking availability tables in Supabase...")
    
    # Check backup_availability
    try:
        res = supabase.table("backup_availability").select("*").limit(1).execute()
        print("[OK] 'backup_availability' table is present and accessible.")
    except Exception as e:
        print(f"[FAIL] 'backup_availability' table check failed: {e}")
        print("Please run the SQL migration script in your Supabase dashboard.")

    # Check instructor_slot_preferences
    try:
        res = supabase.table("instructor_slot_preferences").select("*").limit(1).execute()
        print("[OK] 'instructor_slot_preferences' table is present and accessible.")
    except Exception as e:
        print(f"[FAIL] 'instructor_slot_preferences' table check failed: {e}")
        print("Please run the SQL migration script in your Supabase dashboard.")

if __name__ == "__main__":
    check_tables()
