"""Async Slack notifications — fire-and-forget."""

import asyncio
import httpx
import logging

from app.config import settings

logger = logging.getLogger(__name__)


async def send_workflow_payload(webhook_url: str, data: dict) -> None:
    """
    POST a dict of named variables to a Slack Workflow incoming webhook.
    The Workflow defines the template; this just supplies the values.
    """
    if not webhook_url:
        logger.warning("Slack Workflow webhook URL not configured; skipping.")
        return
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(webhook_url, json=data)
    except Exception as e:
        logger.error(f"Slack Workflow webhook failed: {e}")


async def send_slack_notification(message: str, thread_ts: str = None) -> str:
    """
    Post a pre-formatted text message via Bot API (chat.postMessage).
    Falls back to legacy webhook if bot token is not set.
    Returns the message 'ts' on success.
    """
    if not settings.slack_bot_token and settings.slack_webhook_url and not thread_ts:
        await _send_via_webhook(message)
        return ""

    if not settings.slack_bot_token or not settings.slack_channel_id:
        logger.warning("Slack Bot Token or Channel ID not configured; skipping.")
        return ""

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload: dict = {
                "channel": settings.slack_channel_id,
                "text": message,
                "mrkdwn": True,
            }
            if thread_ts:
                payload["thread_ts"] = thread_ts

            resp = await client.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {settings.slack_bot_token}"},
                json=payload,
            )
            data = resp.json()
            if not data.get("ok"):
                logger.error(f"Slack API error: {data.get('error')}")
                return ""
            return data.get("ts", "")
    except Exception as e:
        logger.error(f"Slack notification failed: {e}")
        return ""


async def _send_via_webhook(message: str) -> None:
    """Send via legacy incoming webhook."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(settings.slack_webhook_url, json={"text": message})
    except Exception as e:
        logger.error(f"Slack webhook failed: {e}")


def fire_slack_notification(message: str, thread_ts: str = None) -> None:
    """Schedule a Slack notification as a background task."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(send_slack_notification(message, thread_ts))
    except RuntimeError:
        logger.warning("No running event loop for Slack notification; skipping.")
