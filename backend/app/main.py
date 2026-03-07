"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.sheets import sheets_service
from app.cache import cache
from app.sync import run_full_sync
from app.auth import router as auth_router
from app.routers.classes import router as classes_router
from app.routers.requests import router as requests_router
from app.routers.admin import router as admin_router
from app.routers.policies import router as policies_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


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

# Routers
app.include_router(auth_router)
app.include_router(classes_router)
app.include_router(requests_router)
app.include_router(admin_router)
app.include_router(policies_router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "mode": "Supabase Connection Active",
        "cache": "disabled"
    }

@app.get("/api/sync")
async def trigger_sync():
    """External Cron triggers this hourly to sync sheets & supabase."""
    try:
        await run_full_sync()
        return {"status": "ok", "message": "Synchronization completed successfully."}
    except Exception as e:
        logger.error(f"Manual Sync Failed: {e}")
        return {"status": "error", "message": str(e)}
