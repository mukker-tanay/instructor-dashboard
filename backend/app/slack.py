"""Async Slack webhook notifications (fire-and-forget)."""

import asyncio
import httpx
import logging

from app.config import settings

logger = logging.getLogger(__name__)


async def send_slack_notification(message: str) -> None:
    """Post a message to Slack via incoming webhook. Fire-and-forget."""
    if not settings.slack_webhook_url:
        logger.warning("Slack webhook URL not configured; skipping notification.")
        return

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                settings.slack_webhook_url,
                json={"text": message},
            )
            if resp.status_code != 200:
                logger.warning(f"Slack returned status {resp.status_code}: {resp.text}")
            else:
                logger.info("Slack notification sent.")
    except Exception as e:
        logger.error(f"Slack notification failed (non-blocking): {e}")


def fire_slack_notification(message: str) -> None:
    """Schedule a Slack notification as a background task (fire-and-forget)."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(send_slack_notification(message))
    except RuntimeError:
        logger.warning("No running event loop for Slack notification; skipping.")
