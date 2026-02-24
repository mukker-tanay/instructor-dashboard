"""Async Slack notifications — uses attachments with mrkdwn_in for reliable bold rendering."""

import asyncio
import httpx
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def _build_payload(message: str, channel: str, thread_ts: str = None) -> dict:
    """Build a chat.postMessage payload using attachments + mrkdwn_in for reliable mrkdwn."""
    payload: dict = {
        "channel": channel,
        "text": "",           # empty — content lives in the attachment
        "attachments": [
            {
                "text": message,
                "mrkdwn_in": ["text"],
                "fallback": message[:200],
            }
        ],
    }
    if thread_ts:
        payload["thread_ts"] = thread_ts
    return payload


async def send_slack_notification(message: str, thread_ts: str = None) -> str:
    """
    Post a message to Slack via Bot API (chat.postMessage).
    Uses attachments with mrkdwn_in so *bold* always renders correctly,
    including when a Slack Workflow bot re-posts the message.
    Returns the message 'ts' on success, or empty string on failure.
    """
    # Fallback to webhook if bot token not set
    if not settings.slack_bot_token and settings.slack_webhook_url and not thread_ts:
        await _send_via_webhook(message)
        return ""

    if not settings.slack_bot_token or not settings.slack_channel_id:
        logger.warning("Slack Bot Token or Channel ID not configured; skipping.")
        return ""

    payload = _build_payload(message, settings.slack_channel_id, thread_ts)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
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
    """Send via incoming webhook — also uses attachments for mrkdwn support."""
    payload = {
        "attachments": [
            {
                "text": message,
                "mrkdwn_in": ["text"],
            }
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(settings.slack_webhook_url, json=payload)
    except Exception as e:
        logger.error(f"Slack webhook failed: {e}")


def fire_slack_notification(message: str, thread_ts: str = None) -> None:
    """Schedule a Slack notification as a background task."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(send_slack_notification(message, thread_ts))
    except RuntimeError:
        logger.warning("No running event loop for Slack notification; skipping.")
