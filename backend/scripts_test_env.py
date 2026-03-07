import os
from pathlib import Path
from dotenv import load_dotenv
from app.config import settings

_BACKEND_DIR = Path(__file__).resolve().parent
_ENV_FILE = _BACKEND_DIR / ".env"

print(f"Loading from: {_ENV_FILE}")
load_dotenv(_ENV_FILE, override=True)

url1 = os.getenv("SUPABASE_URL")
url2 = settings.supabase_url

print(f"OS Env URL: {url1}")
print(f"Pydantic Settings URL: {url2}")
