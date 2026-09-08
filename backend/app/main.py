"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import settings
from app.sheets import sheets_service
from app.cache import cache
from app.sync import run_full_sync, run_pull_sync, run_push_sync, get_sync_status
from app.auth import router as auth_router
from app.routers.classes import router as classes_router
from app.routers.requests import router as requests_router
from app.routers.admin import router as admin_router
from app.routers.policies import router as policies_router
from app.routers.metabase import router as metabase_router
from app.routers.logs import router as logs_router
from app.routers.availability import router as availability_router


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

from app.logger import setup_logging
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialize Google Sheets connection."""
    logger.info("Starting up Backend (Supabase Target)...")
    try:
        sheets_service.initialize()
        logger.info("Application started successfully. Cache disabled.")
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        logger.warning("Running in degraded mode — Sheets connection unavailable for Sync Engine.")

    yield

    # Shutdown
    logger.info("Shutdown complete.")


app = FastAPI(
    title="Instructor Dashboard API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compress large JSON responses (Crucial for Vercel Serverless large datasets)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Routers
app.include_router(auth_router)
app.include_router(classes_router)
app.include_router(requests_router)
app.include_router(admin_router)
app.include_router(policies_router)
app.include_router(metabase_router)
app.include_router(logs_router)
app.include_router(availability_router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "mode": "Supabase Connection Active",
        "cache": "disabled"
    }

@app.get("/api/sync")
async def trigger_sync():
    """Manual/full sync: runs both pull and push in one request. Kept for
    workflow_dispatch and ad-hoc use; the hourly cron now calls the split
    /api/sync/pull and /api/sync/push routes below instead."""
    try:
        await run_full_sync()
        return {"status": "ok", "message": "Synchronization completed successfully."}
    except Exception as e:
        logger.error(f"Manual Sync Failed: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/sync/pull")
async def trigger_pull_sync():
    """Cron triggers this on the hour to pull classes/Slack config: Sheets -> Supabase."""
    try:
        await run_pull_sync()
        return {"status": "ok", "message": "Pull sync completed successfully."}
    except Exception as e:
        logger.error(f"Pull Sync Failed: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/sync/push")
async def trigger_push_sync():
    """Cron triggers this on the half-hour to push unavailability/class-addition requests: Supabase -> Sheets."""
    try:
        await run_push_sync()
        return {"status": "ok", "message": "Push sync completed successfully."}
    except Exception as e:
        logger.error(f"Push Sync Failed: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/sync/status")
async def sync_status():
    """Check when the last manual or cron sync occurred."""
    return await get_sync_status()

