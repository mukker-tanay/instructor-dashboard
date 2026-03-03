"""FastAPI dependencies for auth and role checking."""

from fastapi import Request, HTTPException, Depends

from app.auth import decode_jwt
from app.models import UserInfo
from app.config import settings

EMAIL_ALIASES = {
    "shubham.yadav02@scaler.com": "shubham.yadav@scaler.com"
}

async def get_current_user(request: Request) -> UserInfo:
    """Extract and validate the current user from the JWT session cookie.
    If the user is admin and X-Impersonate header is set, return a UserInfo
    for the impersonated email instead."""
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_jwt(token)
    # Handle known aliases so instructors see their classes properly
    raw_email = payload["sub"].lower()
    primary_email = EMAIL_ALIASES.get(raw_email, raw_email)

    real_user = UserInfo(
        email=primary_email,
        name=payload.get("name", ""),
        picture=payload.get("picture", ""),
        role=payload.get("role", "instructor"),
    )

    # Admin impersonation
    impersonate_email = request.headers.get("X-Impersonate", "").strip()
    if impersonate_email:
        if real_user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admins can impersonate")
        imp_role = "admin" if impersonate_email.lower() in settings.admin_email_list else "instructor"
        return UserInfo(
            email=impersonate_email,
            name=impersonate_email.split("@")[0],
            picture="",
            role=imp_role,
        )

    return real_user


async def require_admin(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """Ensure the current user has admin role."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
