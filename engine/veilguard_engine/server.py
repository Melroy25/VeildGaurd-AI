"""FastAPI application for VeilGuard AI Engine.

In Phase 0, this provides only a loopback health check endpoint.
Future phases will mount /scan and policy endpoints.
"""

from fastapi import FastAPI
from veilguard_engine.config import VERSION

app = FastAPI(
    title="VeilGuard AI Engine",
    description="Context-aware privacy firewall local engine",
    version=VERSION,
)


@app.get("/health")
def health() -> dict[str, str]:
    """Health check endpoint to verify loopback engine availability."""
    return {"status": "ok", "version": VERSION}
