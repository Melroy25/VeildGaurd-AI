# VeilGuard AI: Implementation Status

> **Single Source of Truth:** Per Rule 2 of `AGENTS.md`, every feature is in exactly one of three states: **Implemented** (verified with passing tests or recorded manual run), **Planned**, or **Future**. This table is updated in the same commit that changes a status.

| Feature Component | Phase | Current Status | Evidence |
| :--- | :--- | :--- | :--- |
| **Project Setup & Toolchains** | Phase 0 | **Implemented** | `tests/engine/test_smoke.py` (5 tests pass) |
| **Mock AI Chat Testbed** | Phase 1 | **Implemented** | `mock-ai-site/server.mjs`; `bench/results/enforcement_mock_site.json` |
| **DOM Pre-Submission Interception** | Phase 1 | **Implemented** | `tests/e2e/enforcement-spike.spec.ts` — 0 leaks across 200 flagged trials, 200 benign delivered correctly (10 cells × 20 trials in `bench/results/enforcement_mock_site.json`) |
| **MAIN-World Fetch Backstop** | Phase 1 | **Implemented** | `tests/e2e/enforcement-spike.spec.ts` Part B — 0 leaks across 40 flagged trials (2 cells × 20 trials in `bench/results/enforcement_mock_site.json`) |
| **Presidio & Custom Recognizers** | Phase 2 | **Implemented** | `tests/engine/test_india_detectors.py`, `test_presidio_detector.py`, `test_secrets_detector.py`, `test_validators.py` — 34 tests pass, 3 xfail documenting known spaCy `en_core_web_sm` limits |
| **Local `/scan` Engine API** | Phase 2 | **Implemented** | `tests/engine/test_api_security.py` (9 tests), `test_privacy_invariants.py` — loopback binding, Bearer token auth, Origin enforcement, Rule 7 compliance verified |
| **Declarative YAML Policy Engine** | Phase 3a | **Implemented** | `tests/engine/test_policy_loader.py` (7 tests), `test_policy_evaluator.py` (11 tests including `test_allow_person_alone_not_applied_when_combined`) |
| **Sanitizer (type-based, engine side)** | Phase 3a | **Implemented** | `tests/engine/test_sanitizer.py` (9 tests including `test_spending_patterns_utility_preservation`), `test_api_analyze.py`, `test_privacy_invariants_strong.py` |
| **Extension–Engine Integration** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` — engine at `127.0.0.1:8765` with Bearer token; fail-closed on 401 verified in Part C |
| **Shadow DOM Review Overlay** | Phase 3b | **Implemented** | `tests/e2e/scenarios.spec.ts` (scenario:block, scenario:xss, scenario:emoji, scenario:untrusted-click); `tests/e2e/enforcement-full-chain.spec.ts` Part A |
| **Pre-Submission Approval Flow** | Phase 3b | **Implemented** | `tests/e2e/scenarios.spec.ts` (scenario:sent-text-click, scenario:sent-text-enter, scenario:edit-sends-nothing, scenario:cancel-sends-nothing, scenario:double-enter) |
| **Session Vault** | Phase 3b | **Implemented** | `tests/e2e/scenarios.spec.ts` (scenario:vault-consistency) |
| **Metadata-Only Audit Log** | Phase 3b | **Implemented** | `tests/e2e/scenarios.spec.ts` (scenario:metadata-events, scenario:storage-privacy) — raw text absent from `chrome.storage.local` |
| **Engine-Backed MAIN Backstop** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` Part B — 0 leaks across fetch/xhr backstop cells (20 trials each) |
| **Full-Chain E2E Benchmark** | Phase 3b | **Implemented** | `bench/results/enforcement_full_chain_mock_site.json` — 0 leaks across 200 flagged trials (7 DOM + 2 backstop cells × 20 trials), engine decision: `redact` |
| **Options Page & Token Entry** | Phase 3b | **Implemented** | `extension/src/options/Options.tsx` — Bearer token password input, profile selector, Test Connection, Clear All Vaults confirmed present in source; token sourced from `chrome.storage.local.get("vg_token")` (no hardcoded tokens) |
| **Protection State Badge** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` — badge element `#veilguard-badge-host` verified present in all DOM cells |
| **Task Intent & Necessity Matrix** | Phase 5 | **Planned** | — |
| **Quasi-Identifier & Re-ID Scorer** | Phase 5 | **Planned** | — |
| **Utility-Preserving Sanitizer (task-aware)** | Phase 5 | **Planned** | — |
| **Target AI Site Adapter** | Phase 4 | **Planned** | — |
| **Reproducible Benchmark Suite** | Phase 6 | **Planned** | — |
| **PyMuPDF Document Redaction** | Phase 7 | **Planned** | — |
| **Vault & Response Rehydration** | Phase 8 | **Planned** | — |
