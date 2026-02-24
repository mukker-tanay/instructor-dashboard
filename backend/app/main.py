"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.sheets import sheets_service
from app.cache import cache
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
    """Startup: init sheets + warm cache + start background refresh."""
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
        "cache": {
            "classes": len(cache.classes),
            "unavailability_requests": len(cache.unavailability_requests),
            "class_addition_requests": len(cache.class_addition_requests),
        },
    }
