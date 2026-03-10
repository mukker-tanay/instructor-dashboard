import sys, json; sys.path.append('.')
from dotenv import load_dotenv; load_dotenv()
from app.auth import supabase, resolve_role, UserInfo, create_jwt, decode_jwt

def mock_login(email):
    role = resolve_role(email)
    res = supabase.table("allowed_instructors").select("email, alias_email").eq("email", email.lower()).execute()
    
    record = res.data[0] if res.data else None
    
    if res.data:
        alias = res.data[0].get("alias_email")
        if alias:
            email = alias.strip().lower()
            
    user = UserInfo(email=email, name="Test", picture="", role=role)
    token = create_jwt(user)
    payload = decode_jwt(token)
    return payload["sub"], record

try:
    sub, record = mock_login("shubham.yadav02@scaler.com")
    with open('alias.txt', 'w', encoding='utf-8') as f:
        f.write(f"Record in DB: {record}\nFinal Token Sub: {sub}")
except Exception as e:
    with open('alias.txt', 'w', encoding='utf-8') as f:
        f.write(f"ERROR: {e}")
