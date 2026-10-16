# VeilGuard AI: Implementation Status

> **Single Source of Truth:** Per Rule 2 of `AGENTS.md`, every feature is in exactly one of three states: **Implemented** (verified with passing tests or recorded manual run), **Planned**, or **Future**. This table is updated in the same commit that changes a status.

| Feature Component | Phase | Current Status | Verification / Notes |
| :--- | :--- | :--- | :--- |
| **Project Setup & Toolchains** | Phase 0 | **Implemented** | Smoke tests pass (`pytest`, TypeScript build, Playwright smoke) |
| **Mock AI Chat Testbed** | Phase 1 | **Planned** | Standalone deterministic chat web server for submission tests |
| **DOM Pre-Submission Interception** | Phase 1 | **Planned** | Interception of button clicks, Enter key, and form submission |
| **MAIN-World Fetch Backstop** | Phase 1 | **Planned** | Monkey-patched in-page fetch interceptor to prevent direct API bypass |
| **Presidio & Custom Recognizers** | Phase 2 | **Planned** | Presidio analyzer with Verhoeff-validated Aadhaar, PAN, UPI, IFSC, secrets |
| **Local `/scan` Engine API** | Phase 2 | **Planned** | FastAPI endpoint returning entity spans, confidences, and categories |
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
