from __future__ import annotations

from supabase import create_client, Client

from app.config import get_settings


def get_supabase_client() -> Client:
    """Create and return a Supabase client using the service-role key."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
