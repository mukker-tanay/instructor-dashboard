"""Google OAuth authentication and JWT session management."""

import httpx
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import RedirectResponse
from jose import jwt, JWTError

from app.config import settings
from app.models import UserInfo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def create_jwt(user: UserInfo) -> str:
    payload = {
        "sub": user.email,
        "name": user.name,
        "picture": user.picture,
        "role": user.role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


def resolve_role(email: str) -> str:
    if email.lower() in settings.admin_email_list:
        return "admin"
    return "instructor"


def _get_redirect_uri() -> str:
    """Build callback URI. Use API_BASE_URL if set, else Frontend URL (proxy)."""
    base = (settings.api_base_url or settings.frontend_url).rstrip("/")
    return f"{base}/api/auth/callback"


@router.get("/login")
async def login(request: Request):
    """Redirect to Google OAuth consent screen."""
    redirect_uri = _get_redirect_uri()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url=url)


@router.get("/callback", name="auth_callback")
async def auth_callback(request: Request, code: str):
    """Exchange OAuth code for token and set JWT cookie."""
    redirect_uri = _get_redirect_uri()

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            logger.error(f"Token exchange failed: {token_resp.text}")
            raise HTTPException(status_code=401, detail="Authentication failed")
        tokens = token_resp.json()

        # Get user info
        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Could not fetch user info")
        userinfo = userinfo_resp.json()

    email = userinfo.get("email", "")
    user = UserInfo(
        email=email,
        name=userinfo.get("name", ""),
        picture=userinfo.get("picture", ""),
        role=resolve_role(email),
    )

    token = create_jwt(user)

    # Redirect to frontend root (proxy handles cookie domain)
    response = RedirectResponse(url=settings.frontend_url)
    response.set_cookie(
        key="session",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=settings.jwt_expiry_hours * 3600,
        secure=True,
    )
    return response


@router.get("/me")
async def get_me(request: Request):
    """Return current user info from JWT cookie."""
    """Return current user info from JWT cookie."""
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_jwt(token)
    return UserInfo(
        email=payload["sub"],
        name=payload.get("name", ""),
        picture=payload.get("picture", ""),
        role=payload.get("role", "instructor"),
    )


@router.post("/impersonate")
async def impersonate(request: Request):
    """Admin-only: issue a new JWT as another user and set it as the session cookie.
    Expects JSON body: { "email": "target@example.com" }
    The admin's original JWT is returned so the frontend can restore it later."""
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_jwt(token)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    body = await request.json()
    target_email = body.get("email", "").strip()
    if not target_email:
        raise HTTPException(status_code=400, detail="Email is required")

    # Build a UserInfo for the target
    target_user = UserInfo(
        email=target_email,
        name=target_email.split("@")[0],
        picture="",
        role=resolve_role(target_email),
    )
    new_token = create_jwt(target_user)

    response = Response(status_code=200)
    response.headers["Content-Type"] = "application/json"
    import json
    response.body = json.dumps({"admin_token": token}).encode()
    response.set_cookie(
        key="session",
        value=new_token,
        httponly=True,
        samesite="lax",
        max_age=settings.jwt_expiry_hours * 3600,
        secure=True,
    )
    return response


@router.post("/stop-impersonate")
async def stop_impersonate(request: Request):
    """Restore the admin's original JWT from the request body."""
    body = await request.json()
    admin_token = body.get("admin_token", "").strip()
    if not admin_token:
        raise HTTPException(status_code=400, detail="admin_token is required")

    # Validate the token is real
    payload = decode_jwt(admin_token)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Invalid admin token")

    response = Response(status_code=200)
    response.headers["Content-Type"] = "application/json"
    import json
    response.body = json.dumps({"ok": True}).encode()
    response.set_cookie(
        key="session",
        value=admin_token,
        httponly=True,
        samesite="lax",
        max_age=settings.jwt_expiry_hours * 3600,
        secure=True,
    )
    return response


@router.post("/logout")
async def logout():
    """Clear session cookie."""
    response = Response(status_code=200)
    response.delete_cookie("session")
    return response
