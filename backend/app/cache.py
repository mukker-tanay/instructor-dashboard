"""In-memory cache with periodic refresh from Google Sheets."""

import asyncio
import logging
import time
from typing import List, Dict, Any, Optional

from app.config import settings
from app.sheets import sheets_service

logger = logging.getLogger(__name__)


class CacheManager:
    """Manages in-memory cache of Google Sheets data with periodic refresh."""

    def __init__(self):
        self._classes: List[Dict[str, Any]] = []
        self._unavailability_requests: List[Dict[str, Any]] = []
        self._class_addition_requests: List[Dict[str, Any]] = []
        self._slack_members: List[Dict[str, Any]] = []
        self._last_refresh: float = 0
        self._refresh_task: Optional[asyncio.Task] = None

    @property
    def classes(self) -> List[Dict[str, Any]]:
        return self._classes

    @property
    def unavailability_requests(self) -> List[Dict[str, Any]]:
        return self._unavailability_requests

    @property
    def class_addition_requests(self) -> List[Dict[str, Any]]:
        return self._class_addition_requests

    @property
    def slack_members(self) -> List[Dict[str, Any]]:
        return self._slack_members

    def refresh(self) -> None:
        """Pull fresh data from all sheets. Runs in a sync context."""
        try:
            logger.info("Refreshing cache from Google Sheets...")
            new_classes = sheets_service.get_all_classes()
            new_unavail = sheets_service.get_unavailability_requests()
            new_addition = sheets_service.get_class_addition_requests()
            new_slack = []
            try:
                from app.sheets import SLACK_MEMBERS_SHEET
                new_slack = sheets_service.get_all_records(SLACK_MEMBERS_SHEET)
            except Exception as e:
                logger.warning(f"Could not load Slack members sheet: {e}")

            # Atomic swap
            self._classes = new_classes
            self._unavailability_requests = new_unavail
            self._class_addition_requests = new_addition
            self._slack_members = new_slack
            self._last_refresh = time.time()

            logger.info(
                f"Cache refreshed: {len(self._classes)} classes, "
                f"{len(self._unavailability_requests)} unavailability requests, "
                f"{len(self._class_addition_requests)} class addition requests."
            )
        except Exception as e:
            logger.error(f"Cache refresh failed: {e}")

    async def _periodic_refresh(self) -> None:
        """Background loop that refreshes the cache every N seconds."""
        while True:
            try:
                await asyncio.to_thread(self.refresh)
            except Exception as e:
                logger.error(f"Background cache refresh error: {e}")
            await asyncio.sleep(settings.cache_refresh_seconds)

    def start_background_refresh(self) -> None:
        """Start the background refresh task."""
        self._refresh_task = asyncio.create_task(self._periodic_refresh())
        logger.info(
            f"Background cache refresh started (interval={settings.cache_refresh_seconds}s)."
        )

    def stop_background_refresh(self) -> None:
        """Stop the background refresh task."""
        if self._refresh_task:
            self._refresh_task.cancel()
            logger.info("Background cache refresh stopped.")

    def force_refresh_requests(self) -> None:
        """Force refresh only the request sheets (after a write)."""
        try:
            self._unavailability_requests = sheets_service.get_unavailability_requests()
            self._class_addition_requests = sheets_service.get_class_addition_requests()
            logger.info("Request cache force-refreshed after write.")
        except Exception as e:
            logger.error(f"Force refresh failed: {e}")

    def ensure_initialized(self) -> None:
        """If cache is empty, force a refresh immediately (sync).
        Useful for serverless cold starts where lifespan might have timed out or failed.
        """
        if not self._classes:
            logger.info("Cache empty! forcing on-demand refresh...")
            self.refresh()


# Singleton
cache = CacheManager()
