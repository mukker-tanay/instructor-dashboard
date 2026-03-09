"""Async Slack notifications — fire-and-forget."""

import asyncio
import httpx
import logging

from app.config import settings

logger = logging.getLogger(__name__)


async def send_workflow_payload(webhook_url: str, data: dict) -> None:
    """
    POST named variables to a Slack Workflow / Automation trigger webhook.
    Empty-string and None values are stripped so typed variables (e.g. 'Slack user')
    don't receive invalid empty payloads, which causes Slack to return 400.
    """
    if not webhook_url:
        logger.warning("Slack Workflow webhook URL not configured; skipping.")
        return

    # Only replace None or empty string values with "None" — Slack requires ALL 
    # declared variables to be present and non-empty. Missing or empty keys cause 
    # 'invalid_workflow_input' 400 errors.
    clean_data = {k: (v if v else "None") for k, v in data.items()}

    logger.info(f"Slack Workflow payload keys: {list(clean_data.keys())}")
    logger.debug(f"Slack Workflow payload: {clean_data}")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=clean_data)
            if resp.status_code >= 400:
                logger.error(
                    f"Slack Workflow webhook returned {resp.status_code}: {resp.text}"
                )
            else:
                logger.info(f"Slack Workflow webhook OK ({resp.status_code})")
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
