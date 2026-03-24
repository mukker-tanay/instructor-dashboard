"""FastAPI dependencies for auth and role checking."""

from fastapi import Request, HTTPException, Depends

from app.auth import decode_jwt
from app.models import UserInfo
from app.config import settings

async def get_current_user(request: Request) -> UserInfo:
    """Extract and validate the current user from the JWT session cookie.
    If the user is admin and X-Impersonate header is set, return a UserInfo
    for the impersonated email instead."""
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_jwt(token)
    primary_email = payload["sub"].lower()

    real_user = UserInfo(
        email=primary_email,
        name=payload.get("name", ""),
        picture=payload.get("picture", ""),
        role=payload.get("role", "instructor"),
    )

    # Impersonation (Admin or Loco)
    impersonate_email = request.headers.get("X-Impersonate", "").strip()
    if impersonate_email:
        if real_user.role not in ["admin", "loco"]:
            raise HTTPException(status_code=403, detail="Only admins and loco team can impersonate")
            
        target_is_admin = impersonate_email.lower() in settings.admin_email_list
        if real_user.role == "loco" and target_is_admin:
            raise HTTPException(status_code=403, detail="Loco team cannot impersonate admins")

        imp_role = "admin" if target_is_admin else "instructor"
        return UserInfo(
            email=impersonate_email,
            name=impersonate_email.split("@")[0],
            picture="",
            role=imp_role,
            raised_by_email=real_user.email,  # Track who actually submitted
        )

    return real_user


async def require_admin(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """Ensure the current user has admin role."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
