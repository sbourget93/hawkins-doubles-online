"""Google login (cosmetic identity only).

The browser obtains a Google ID token via Google Identity Services and posts it
here; we verify it, then remember the user's identity in the signed session
cookie (see SessionMiddleware in main.py). There is NO enforcement yet: every
existing endpoint stays open and the frontend's `isAdmin` is unchanged. The
allowlist below is exposed on `/auth/me` (`is_admin`) purely so a future
role-gating step can flip on without reworking this module.

Routes have no `/api` prefix — nginx strips it before proxying (see main.py).
"""

import os

from fastapi import APIRouter, HTTPException, Request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
# Comma-separated allowlist; membership only sets the `is_admin` flag for now.
ADMIN_EMAILS = {
    e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()
}

router = APIRouter()

# One reusable transport for token verification (fetches Google's signing certs).
_google_request = google_requests.Request()


class GoogleCredential(BaseModel):
    credential: str  # the Google ID token (JWT) from the GIS callback


def _is_admin(email: str) -> bool:
    return email.lower() in ADMIN_EMAILS


@router.get("/auth/config")
def auth_config():
    """Public config the frontend needs to initialize Google Identity Services."""
    return {"google_client_id": GOOGLE_CLIENT_ID}


@router.get("/auth/me")
def auth_me(request: Request):
    """The currently signed-in identity, or null. Read from the session cookie."""
    return {"user": request.session.get("user")}


@router.post("/auth/google")
def auth_google(body: GoogleCredential, request: Request):
    """Verify a Google ID token and store the identity in the session."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google login is not configured")
    try:
        claims = id_token.verify_oauth2_token(
            body.credential, _google_request, GOOGLE_CLIENT_ID
        )
    except ValueError:
        # Invalid signature, wrong audience, or expired token.
        raise HTTPException(status_code=401, detail="Invalid Google credential")

    email = claims.get("email", "")
    user = {
        "email": email,
        "name": claims.get("name") or email,
        "picture": claims.get("picture"),
        "is_admin": _is_admin(email),
    }
    request.session["user"] = user
    return {"user": user}


@router.post("/auth/logout")
def auth_logout(request: Request):
    """Clear the session cookie."""
    request.session.clear()
    return {"user": None}
