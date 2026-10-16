"""FastAPI application for VeilGuard AI Engine.

Secured local privacy engine endpoints:
- GET /health: Unauthenticated loopback health check
- POST /scan: Authenticated privacy and security scan endpoint
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from veilguard_engine.config import VERSION
from veilguard_engine.models import ScanRequest, ScanResponse
from veilguard_engine.scanner import Scanner
from veilguard_engine.security import (
    OriginCheckMiddleware,
    configure_privacy_logging,
    sanitized_validation_exception_handler,
    verify_bearer_token,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialize heavy models (spaCy/Presidio) and security filters once at application startup."""
    configure_privacy_logging()
    app.state.scanner = Scanner()
    yield


app = FastAPI(
    title="VeilGuard AI Engine",
    description="Context-aware privacy firewall local engine",
    version=VERSION,
    lifespan=lifespan,
)

# 1. Security Middleware: Allowed Host check (DNS rebinding protection)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["127.0.0.1", "localhost", "testserver"],
)

# 2. Security Middleware: Origin header verification (chrome-extension:// only)
app.add_middleware(OriginCheckMiddleware)

# 3. Privacy Hygiene: Custom sanitized validation error handler
app.add_exception_handler(RequestValidationError, sanitized_validation_exception_handler)


@app.get("/health")
def health() -> dict[str, str]:
    """Health check endpoint to verify loopback engine availability."""
    return {"status": "ok", "version": VERSION}


@app.post("/scan", response_model=ScanResponse)
def scan_text(
    payload: ScanRequest,
    request: Request,
    _token: str = Depends(verify_bearer_token),
) -> ScanResponse:
    """Analyze input text for sensitive privacy identifiers and secrets.

    Returns character offsets, entity types, categories, and templated explanations.
    NEVER echoes or returns matched sensitive text.
    """
    scanner: Scanner = getattr(request.app.state, "scanner", None)
    if scanner is None:
        scanner = Scanner()
        request.app.state.scanner = scanner

    return scanner.scan(payload.text, source=payload.source)
