"""Security middleware, authentication, and privacy hygiene for VeilGuard API.

Enforces:
1. Bearer token authentication (secrets.compare_digest).
2. Local token file persistence (.veilguard/token, gitignored).
3. Origin verification (chrome-extension:// only, reject foreign web origins).
4. Sanitized request validation error handlers (never echo submitted input).
5. Strict privacy logging filters (zero payload or matched text exposure).
"""

import logging
import os
import secrets
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, Request, Security, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from veilguard_engine import config

logger = logging.getLogger("veilguard_engine.security")

bearer_scheme = HTTPBearer(auto_error=False)


def get_or_create_api_token() -> str:
    """Retrieve API token from environment, or generate and persist locally.

    Rule 11 Invariant: Log the token file path, NEVER the token itself.
    """
    env_token = os.getenv(config.TOKEN_ENV_VAR)
    if env_token:
        logger.info("Using API token configured via environment variable %s", config.TOKEN_ENV_VAR)
        return env_token.strip()

    token_file = Path(config.TOKEN_FILE_PATH)
    if token_file.exists():
        try:
            token = token_file.read_text(encoding="utf-8").strip()
            if token:
                logger.info("Loaded persistent API token from %s", token_file.resolve())
                return token
        except Exception as e:
            logger.warning("Could not read token from %s: %s", token_file, e)

    # Generate new cryptographically secure token
    token = secrets.token_urlsafe(32)
    try:
        token_file.parent.mkdir(parents=True, exist_ok=True)
        token_file.write_text(token, encoding="utf-8")
        logger.info("Generated new API token and persisted to %s", token_file.resolve())
    except Exception as e:
        logger.warning("Could not persist API token to %s: %s", token_file, e)

    return token


# Cached active token
ACTIVE_API_TOKEN: str = get_or_create_api_token()


def verify_bearer_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme),
) -> str:
    """Validate Bearer token using constant-time comparison."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Use constant-time comparison to prevent timing attacks
    is_valid = secrets.compare_digest(credentials.credentials, ACTIVE_API_TOKEN)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Bearer authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return credentials.credentials


class OriginCheckMiddleware(BaseHTTPMiddleware):
    """Enforces that if an Origin header is present, it must originate from chrome-extension://.

    Blocks cross-origin requests from arbitrary websites running in the user's browser.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        origin = request.headers.get("origin")
        if origin:
            if not origin.startswith("chrome-extension://"):
                return Response(
                    content='{"detail": "Forbidden: cross-origin browser requests rejected."}',
                    status_code=status.HTTP_403_FORBIDDEN,
                    media_type="application/json",
                )
        return await call_next(request)


async def sanitized_validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Custom 422 handler that sanitizes validation errors to NEVER echo submitted input text."""
    sanitized_errors = []
    for err in exc.errors():
        sanitized_errors.append(
            {
                "type": err.get("type", "value_error"),
                "loc": err.get("loc", []),
                "msg": err.get("msg", "Invalid field format or length."),
            }
        )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Request validation error. Input content exceeds limit or format is invalid.",
            "errors": sanitized_errors,
        },
    )


class SensitiveLogFilter(logging.Filter):
    """Filter that strips or blocks any raw text content or token dumps from logging output."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if "text=" in msg or "prompt=" in msg or "Context list is" in msg:
            return False
        # Suppress Presidio-analyzer debug token and context dumps
        if record.name.startswith("presidio") and record.levelno < logging.INFO:
            return False
        return True


def configure_privacy_logging():
    """Ensure root and sub-loggers never output raw prompt data or Presidio token lists."""
    log_filter = SensitiveLogFilter()
    root_log = logging.getLogger()
    if log_filter not in root_log.filters:
        root_log.addFilter(log_filter)
    for h in root_log.handlers:
        if log_filter not in h.filters:
            h.addFilter(log_filter)

    for logger_name in ["veilguard_engine", "presidio-analyzer", "uvicorn", "uvicorn.access"]:
        log = logging.getLogger(logger_name)
        if log_filter not in log.filters:
            log.addFilter(log_filter)
        for h in log.handlers:
            if log_filter not in h.filters:
                h.addFilter(log_filter)


# Initialize logging protection immediately on import
configure_privacy_logging()
