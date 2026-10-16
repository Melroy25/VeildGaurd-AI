import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator, List

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from veilguard_engine.config import VERSION
from veilguard_engine.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    AnalyzeStats,
    ProfileInfo,
    RuleInfo,
    ScanRequest,
    ScanResponse,
)
from veilguard_engine.policy import PolicyEvaluator, PolicyRegistry
from veilguard_engine.policy.models import Decision
from veilguard_engine.sanitizer import Sanitizer
from veilguard_engine.scanner import Scanner
from veilguard_engine.security import (
    OriginCheckMiddleware,
    configure_privacy_logging,
    sanitized_validation_exception_handler,
    verify_bearer_token,
)
from veilguard_engine.utils import convert_findings_to_utf16


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialize heavy models, policy registry, and security filters once at application startup."""
    configure_privacy_logging()
    app.state.scanner = Scanner()
    app.state.policy_registry = PolicyRegistry()
    app.state.sanitizer = Sanitizer(scanner=app.state.scanner)
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


def _get_scanner(request: Request) -> Scanner:
    scanner: Scanner = getattr(request.app.state, "scanner", None)
    if scanner is None:
        scanner = Scanner()
        request.app.state.scanner = scanner
    return scanner


def _get_policy_registry(request: Request) -> PolicyRegistry:
    registry: PolicyRegistry = getattr(request.app.state, "policy_registry", None)
    if registry is None:
        registry = PolicyRegistry()
        request.app.state.policy_registry = registry
    return registry


def _get_sanitizer(request: Request, scanner: Scanner) -> Sanitizer:
    sanitizer: Sanitizer = getattr(request.app.state, "sanitizer", None)
    if sanitizer is None:
        sanitizer = Sanitizer(scanner=scanner)
        request.app.state.sanitizer = sanitizer
    return sanitizer


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
    scanner = _get_scanner(request)
    scan_res = scanner.scan(payload.text, source=payload.source)
    utf16_findings = convert_findings_to_utf16(scan_res.findings, payload.text)
    return ScanResponse(
        offset_unit="utf16",
        findings=utf16_findings,
        stats=scan_res.stats,
    )


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_text(
    payload: AnalyzeRequest,
    request: Request,
    _token: str = Depends(verify_bearer_token),
) -> AnalyzeResponse:
    """Analyze input text, evaluate policy rules, and generate utility-preserving sanitization.

    Enforces deterministic decision precedence (allow < redact < require_approval < block).
    Returns sanitized text, replacement mapping, and safety notices without leaking matched text.
    """
    t_start = time.perf_counter()

    registry = _get_policy_registry(request)
    scanner = _get_scanner(request)
    sanitizer = _get_sanitizer(request, scanner)

    # 1. Resolve requested profile
    profile_name = payload.profile or "company"
    profile_obj = registry.get_profile(profile_name)
    if profile_obj is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid policy profile requested.",
        )

    # 2. Resolve destination trust
    dest_trust = registry.get_destination_trust(payload.destination)

    # 3. Detect sensitive entities
    scan_res = scanner.scan(payload.text, source=payload.source)
    utf16_findings = convert_findings_to_utf16(scan_res.findings, payload.text)

    # 4. Evaluate policy rules
    policy_result = PolicyEvaluator.evaluate(
        findings=scan_res.findings,
        source=payload.source,
        destination_trust=dest_trust,
        profile=profile_obj,
    )

    # 5. Sanitize text unless decision is explicitly allow
    if policy_result.decision == Decision.ALLOW:
        sanitization_result = None
    else:
        sanitization_result = sanitizer.sanitize(
            text=payload.text,
            findings=scan_res.findings,
            policy_result=policy_result,
            known_placeholders=payload.known_placeholders,
        )

    total_latency_ms = (time.perf_counter() - t_start) * 1000.0

    stats = AnalyzeStats(
        latency_ms=round(total_latency_ms, 3),
        profile=profile_name,
        destination_trust=dest_trust,
        scan_stats=scan_res.stats,
    )

    return AnalyzeResponse(
        offset_unit="utf16",
        decision=policy_result.decision,
        options=policy_result.options,
        summary=policy_result.summary,
        applied_rules=policy_result.applied_rules,
        findings=utf16_findings,
        sanitization=sanitization_result,
        stats=stats,
    )


@app.get("/policy/profiles", response_model=List[ProfileInfo])
def get_policy_profiles(
    request: Request,
    _token: str = Depends(verify_bearer_token),
) -> List[ProfileInfo]:
    """Return all available policy profiles and their rules for UI configuration."""
    registry = _get_policy_registry(request)
    return [
        ProfileInfo(
            profile=p.profile,
            description=p.description,
            rules=[RuleInfo(rule_id=r.id, reason=r.reason) for r in p.rules],
        )
        for p in registry.list_profiles()
    ]


