# VeilGuard AI: Implementation Status

> **Single Source of Truth:** Per Rule 2 of `AGENTS.md`, every feature is in exactly one of three states: **Implemented** (verified with passing tests or recorded manual run), **Planned**, or **Future**. This table is updated in the same commit that changes a status.

| Feature Component | Phase | Current Status | Verification / Notes |
| :--- | :--- | :--- | :--- |
| **Project Setup & Toolchains** | Phase 0 | **Implemented** | Smoke tests pass (`pytest`, TypeScript build, Playwright smoke) |
| **Mock AI Chat Testbed** | Phase 1 | **Implemented** | Standalone deterministic chat web server (`mock-ai-site/server.mjs`) on port 4310 supporting configurable composer, wiring, and transport modes |
| **DOM Pre-Submission Interception** | Phase 1 | **Implemented** | Capture-phase listeners on Enter key, submit buttons, and form submit events. Verified no leaks observed across 200 flagged trials and 200 benign delivered correctly (10 matrix cells, 400 total trials) in `bench/results/enforcement_mock_site.json` |
| **MAIN-World Fetch Backstop** | Phase 1 | **Implemented** | Monkey-patched in-page `window.fetch` and `XMLHttpRequest` in host MAIN execution world. Verified no leaks observed across 40 flagged trials and 40 benign delivered correctly (2 cells, 80 total trials) in `bench/results/enforcement_mock_site.json` |
| **Presidio & Custom Recognizers** | Phase 2 | **Implemented** | Presidio 2.2 + spaCy `en_core_web_sm` + `IndiaDetector` (Aadhaar/Verhoeff, PAN, GSTIN, IFSC, Mobile, UPI) + `SecretsDetector` (AWS, GitHub, Slack, Google, JWT, connection strings) + `WatchlistDetector`. 34 tests pass, 3 xfail document known spaCy `en_core_web_sm` limitations (`tests/engine/test_india_detectors.py`, `test_presidio_detector.py`, `test_secrets_detector.py`, `test_validators.py`, `test_known_limitations.py`). |
| **Local `/scan` Engine API** | Phase 2 | **Implemented** | `POST /scan` FastAPI endpoint with Bearer token auth, loopback-only host check, Origin header enforcement, overlap-resolving scanner with 5-tier priority, metadata-only response (no raw text). 9 API security tests pass (`tests/engine/test_api_security.py`). Privacy invariant (Rule 7) verified in `test_privacy_invariants.py`. |
| **Task Intent & Necessity Matrix** | Phase 5 | **Planned** | Heuristic/classifier task intent scoring with necessity matrices |
| **Quasi-Identifier & Re-ID Scorer**| Phase 5 | **Planned** | Multi-attribute correlation and combination re-identification risk scoring |
| **Declarative YAML Policy Engine** | Phase 3 | **Planned** | Rule engine matching conditions to decisions (ALLOW, REDACT, APPROVE, BLOCK) |
| **Utility-Preserving Sanitizer**   | Phase 3 | **Planned** | Consistent pseudonym substitution, generalization, and diff generation |
| **Shadow DOM Review Overlay**     | Phase 3 | **Planned** | In-browser approval modal showing detected risks and sanitized diffs |
| **Metadata-Only Audit Dashboard**  | Phase 3 | **Planned** | Options page React dashboard tracking risks and decisions without prompt text |
| **Target AI Site Adapter**         | Phase 4 | **Planned** | Dedicated adapter with robust selectors for one target AI chat interface |
| **Protection State Badge**        | Phase 4 | **Planned** | Visual indicator displaying "Protection Active" or "Protection Inactive" |
| **Reproducible Benchmark Suite**   | Phase 6 | **Planned** | Comparison between keyword baseline, default Presidio, and VeilGuard |
| **PyMuPDF Document Redaction**     | Phase 7 | **Planned** | True vector/raster redaction with post-sanitization extraction verification |
| **Vault & Response Rehydration**   | Phase 8 | **Planned** | Session-scoped token vault mapping AI outputs back to original identifiers |
