import sys, json; sys.path.append('.')
from dotenv import load_dotenv; load_dotenv()
from app.supabase_client import supabase

try:
    # Instead of filtering in DB which might fail if column missing, just fetch all and filter in python
    res = supabase.table('classes').select('*').limit(1000).execute()
    emails = set()
    for row in res.data:
        e = row.get('instructor_email', '')
        n = row.get('instructor_name', '')
        if 'shubham' in e.lower() or 'shubham' in n.lower():
            emails.add((e, n))
            
    with open('yadav.txt', 'w', encoding='utf-8') as f:
        f.write("Found Shubhams:\n" + "\n".join(f"{e} - {n}" for e, n in emails))
except Exception as e:
    with open('yadav.txt', 'w', encoding='utf-8') as f: f.write(f'ERROR: {e}')
