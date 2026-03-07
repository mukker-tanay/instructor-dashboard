"""Obsoleted cache file. Retained for import compatibility only."""

import logging

logger = logging.getLogger(__name__)


class CacheManager:
    """Mock cache manager to prevent import errors during transition to Supabase."""

    def __init__(self):
        self._classes = []
        self._unavailability_requests = []
        self._class_addition_requests = []
        self._slack_members = []

    @property
    def classes(self):
        return []

    @property
    def unavailability_requests(self):
        return []

    @property
    def class_addition_requests(self):
        return []

    @property
    def slack_members(self):
        return []

    def refresh(self) -> None:
        logger.info("Legacy cache.refresh() called. Doing nothing (Supabase active).")

    def start_background_refresh(self) -> None:
        pass

    def stop_background_refresh(self) -> None:
        pass

    def force_refresh_requests(self) -> None:
        pass

    def ensure_initialized(self) -> None:
        pass


cache = CacheManager()
