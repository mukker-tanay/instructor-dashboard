import sys
import re

file_path = "backend/app/main.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add sync import
if "from app.sync import run_full_sync" not in content:
    content = content.replace("from app.cache import cache", "from app.cache import cache\nfrom app.sync import run_full_sync")


# 1. Update Lifespan (remove cache completely)
old_lifespan = """@asynccontextmanager
async def lifespan(app: FastAPI):
    \"\"\"Startup: init sheets + warm cache + start background refresh.\"\"\"
    logger.info("Starting up...")
    try:
        sheets_service.initialize()
        cache.refresh()
        cache.start_background_refresh()
        logger.info("Application started successfully.")
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        logger.warning("Running in degraded mode — Sheets connection unavailable.")

    yield

    # Shutdown
    cache.stop_background_refresh()
    logger.info("Shutdown complete.")"""

new_lifespan = """@asynccontextmanager
async def lifespan(app: FastAPI):
    \"\"\"Startup: initialize Google Sheets connection.\"\"\"
    logger.info("Starting up Backend (Supabase Target)...")
    try:
        sheets_service.initialize()
        logger.info("Application started successfully. Cache disabled.")
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        logger.warning("Running in degraded mode — Sheets connection unavailable for Sync Engine.")

    yield

    # Shutdown
    logger.info("Shutdown complete.")"""

content = content.replace(old_lifespan, new_lifespan)

# 2. Add /api/sync and update /api/health
old_health = """@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "cache": {
            "classes": len(cache.classes),
            "unavailability_requests": len(cache.unavailability_requests),
            "class_addition_requests": len(cache.class_addition_requests),
        },
    }"""

new_health = """@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "mode": "Supabase Connection Active",
        "cache": "disabled"
    }

@app.get("/api/sync")
async def trigger_sync():
    \"\"\"External Cron triggers this hourly to sync sheets & supabase.\"\"\"
    try:
        await run_full_sync()
        return {"status": "ok", "message": "Synchronization completed successfully."}
    except Exception as e:
        logger.error(f"Manual Sync Failed: {e}")
        return {"status": "error", "message": str(e)}"""

content = content.replace(old_health, new_health)

import builtins
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("done rewriting main.py natively")
