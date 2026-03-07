"""Supabase client initialization."""

import os
from supabase import create_client, Client
from app.config import settings
import logging

logger = logging.getLogger(__name__)

url: str = settings.supabase_url
key: str = settings.supabase_key

supabase: Client | None = None

if url and key:
    try:
        supabase = create_client(url, key)
        logger.info("Supabase client initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
else:
    logger.warning("SUPABASE_URL and/or SUPABASE_KEY are missing. Supabase operations will fail.")
