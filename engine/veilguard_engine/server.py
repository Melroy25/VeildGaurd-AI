import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator, List

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from veilguard_engine.config import VERSION, HOST, PORT
from veilguard_engine.context import infer_task
from veilguard_engine.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    AnalyzeStats,
    ContextBlock,
    ContextReid,
    ContextTask,
    ContextUtility,
    FindingNecessity,
    ProfileInfo,
    ReidContributor,
    RuleInfo,
    ScanRequest,
    ScanResponse,
)
from veilguard_engine.pdf.models import PDFScanResponse
from veilguard_engine.necessity import evaluate_necessity
from veilguard_engine.policy import PolicyEvaluator, PolicyRegistry
from veilguard_engine.policy.models import Action, Decision
from veilguard_engine.reid import ReidReducer, ReidScorer
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

# 2. Security Middleware: Origin header verification (chrome-extension://, loopback, and dashboard)
app.add_middleware(OriginCheckMiddleware)

# 3. CORS Middleware: Allow chrome-extension://, loopback, and dashboard (outermost)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"chrome-extension://.*|http://(127\.0\.0\.1|localhost)(:\d+)?|https://veilguard-ai\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. Privacy Hygiene: Custom sanitized validation error handler
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


@app.post("/auth/pair")
def auto_pair(request: Request) -> dict[str, str]:
    """Zero-configuration auto-pairing endpoint for local VeilGuard extension.

    Permits pairing only from local loopback with valid chrome-extension Origin.
    """
    from veilguard_engine.security import ACTIVE_API_TOKEN
    return {"token": ACTIVE_API_TOKEN, "status": "paired"}


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

    # 4. Context Intelligence: Task inference & Re-ID scoring
    task_prof = infer_task(payload.text, task_hint=payload.task_hint)
    reid_score = ReidScorer.get_instance().score_findings(scan_res.findings)

    # 5. Evaluate policy rules
    policy_result = PolicyEvaluator.evaluate(
        findings=scan_res.findings,
        source=payload.source,
        destination_trust=dest_trust,
        profile=profile_obj,
        reid_level=reid_score.level,
    )

    # 6. Evaluate task-aware necessity and adjust policy actions/decision
    nec_res = evaluate_necessity(
        findings=scan_res.findings,
        policy_result=policy_result,
        task_profile=task_prof,
    )
    policy_result.decision = nec_res.adjusted_decision
    policy_result.per_finding_actions = nec_res.adjusted_actions

    # 7. Re-identification reduction for high/medium re-id risk
    reducer = ReidReducer()
    red_res = reducer.reduce(
        text=payload.text,
        findings=scan_res.findings,
        per_finding_necessity=nec_res.per_finding_necessity,
    )
    for fid in red_res.applied:
        policy_result.per_finding_actions[fid] = Action.GENERALIZE
    if red_res.required_prevented_target:
        if policy_result.decision in (Decision.ALLOW, Decision.REDACT):
            policy_result.decision = Decision.REQUIRE_APPROVAL
        nec_res.tradeoffs.append({
            "finding_id": "reid_target",
            "category": "QUASI_IDENTIFIER",
            "tradeoff": "Re-identification risk remains above target because required details were preserved.",
        })

    # 8. Sanitize text unless decision is explicitly allow
    if policy_result.decision == Decision.ALLOW:
        sanitization_result = None
    else:
        sanitization_result = sanitizer.sanitize(
            text=payload.text,
            findings=scan_res.findings,
            policy_result=policy_result,
            known_placeholders=payload.known_placeholders,
            role_placeholders=True,
            generalizations=red_res.generalizations,
        )

    # 9. Build context intelligence response block (metadata and rule IDs only, NEVER raw text)
    context_block = ContextBlock(
        task=ContextTask(
            type=task_prof.type,
            confidence=task_prof.confidence,
            evidence=task_prof.evidence,
        ),
        necessity=[
            FindingNecessity(finding_id=fid, level=lvl)
            for fid, lvl in nec_res.per_finding_necessity.items()
        ],
        reidentification=ContextReid(
            score_before=red_res.score_before,
            score_after=red_res.score_after,
            level_before=red_res.level_before,
            level_after=red_res.level_after,
            contributors=[
                ReidContributor(type=c.type, weight=c.weight)
                for c in red_res.contributors
            ],
            target=red_res.target,
            applied=red_res.applied,
        ),
        tradeoffs=nec_res.tradeoffs,
        utility=ContextUtility(
            basis=nec_res.utility.basis,
            may_change_result=nec_res.utility.may_change_result,
            notes=[nec_res.utility.notes],
        ),
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
        context=context_block,
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


async def _extract_pdf_bytes_and_profile(request: Request) -> tuple[bytes, str]:
    """Extract PDF binary content and policy profile from raw body or base64 JSON."""
    content_type = request.headers.get("content-type", "")
    profile = request.headers.get("x-profile", "company")

    if "application/json" in content_type:
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=422, detail="Invalid JSON body")
        if not isinstance(payload, dict) or "pdf_base64" not in payload:
            raise HTTPException(status_code=422, detail="JSON payload must contain 'pdf_base64' string")
        profile = payload.get("profile", profile)
        import base64
        try:
            pdf_bytes = base64.b64decode(payload["pdf_base64"])
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid base64 payload: {exc}")
    else:
        pdf_bytes = await request.body()

    return pdf_bytes, profile


@app.post("/pdf/scan", response_model=PDFScanResponse)
async def endpoint_pdf_scan(
    request: Request,
    _token: str = Depends(verify_bearer_token),
) -> PDFScanResponse:
    """Scan text-based PDF in-memory and return entity bounding boxes without raw text."""
    from veilguard_engine.pdf import (
        InvalidPDFError,
        PDFLimitExceededError,
        scan_pdf,
    )
    scanner = _get_scanner(request)
    pdf_bytes, profile = await _extract_pdf_bytes_and_profile(request)
    if not pdf_bytes:
        raise HTTPException(status_code=422, detail="Empty PDF body")

    try:
        return scan_pdf(pdf_bytes, scanner, profile=profile)
    except PDFLimitExceededError as exc:
        status_code = 413 if "size" in str(exc).lower() else 422
        raise HTTPException(status_code=status_code, detail=str(exc))
    except InvalidPDFError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal scan failure: {exc}")


@app.post("/pdf/redact")
async def endpoint_pdf_redact(
    request: Request,
    _token: str = Depends(verify_bearer_token),
) -> Response:
    """Apply true redactions in-memory, scrub metadata, and dual-verify sanitization."""
    from fastapi import Response
    from veilguard_engine.pdf import (
        InvalidPDFError,
        PDFLimitExceededError,
        RedactionVerificationError,
        redact_pdf,
    )
    scanner = _get_scanner(request)
    pdf_bytes, profile = await _extract_pdf_bytes_and_profile(request)
    if not pdf_bytes:
        raise HTTPException(status_code=422, detail="Empty PDF body")

    try:
        sanitized_bytes, count = redact_pdf(pdf_bytes, scanner, profile=profile)
    except PDFLimitExceededError as exc:
        status_code = 413 if "size" in str(exc).lower() else 422
        raise HTTPException(status_code=status_code, detail=str(exc))
    except InvalidPDFError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RedactionVerificationError as exc:
        raise HTTPException(status_code=500, detail=f"Redaction verification failed: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal redaction failure: {exc}")

    return Response(
        content=sanitized_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="sanitized.pdf"',
            "X-VeilGuard-Entities-Redacted": str(count),
            "X-VeilGuard-Dual-Verified": "true",
        },
    )


if __name__ == "__main__":
    import uvicorn
    from veilguard_engine.config import HOST, PORT

    uvicorn.run("veilguard_engine.server:app", host=HOST, port=PORT, log_level="info")




