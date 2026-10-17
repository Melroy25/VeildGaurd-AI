# VeilGuard AI: Implementation Status

> **Single Source of Truth:** Per Rule 2 of `AGENTS.md`, every feature is in exactly one of three states: **Implemented** (verified with passing tests or recorded manual run), **Planned**, or **Future**. This table is updated in the same commit that changes a status.

| Feature Component | Phase | Current Status | Evidence |
| :--- | :--- | :--- | :--- |
| **Project Setup & Toolchains** | Phase 0 | **Implemented** | `tests/engine/test_smoke.py` (5 tests pass) |
| **Mock AI Chat Testbed** | Phase 1 | **Implemented** | `mock-ai-site/server.mjs`; `bench/results/enforcement_mock_site.json` |
| **DOM Interception — Send Button (click)** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` (`textarea/form/click`, `textarea/click/click`, `contenteditable/form/click`, `contenteditable/click/click`) — 0 leaks, 20/20 delivered in 2 consecutive runs |
| **DOM Interception — Enter Key** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` (`textarea/form/enter`, `textarea/click/enter`, `contenteditable/form/enter`, `contenteditable/click/enter`) — 0 leaks, 20/20 delivered in 2 consecutive runs |
| **DOM Interception — requestSubmit** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` (`textarea/form/requestSubmit`, `contenteditable/form/requestSubmit`) — 0 leaks, 20/20 delivered in 2 consecutive runs |
| **DOM Interception — Controlled State** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` (`textarea/click/click (state=controlled)`, `contenteditable/click/click (state=controlled)`) — 0 leaks, 20/20 delivered in 2 consecutive runs |
| **MAIN-World Backstop (fetch & xhr)** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` (`backstop/fetch`, `backstop/xhr`) — 0 leaks across 40 flagged trials, 20/20 benign delivered in 2 consecutive runs |
| **Presidio & Custom Recognizers** | Phase 2 | **Implemented** | `tests/engine/test_india_detectors.py`, `test_presidio_detector.py`, `test_secrets_detector.py`, `test_validators.py` — 34 tests pass, 4 xfail documenting known spaCy `en_core_web_sm` and medical limits |
| **Local `/scan` & `/analyze` Engine API** | Phase 2/3a | **Implemented** | `tests/engine/test_api_security.py` (9 tests), `test_api_analyze.py`, `test_privacy_invariants.py` — loopback binding, Bearer token auth, Origin enforcement, Rule 7 compliance verified |
| **Declarative YAML Policy Engine** | Phase 3a | **Implemented** | `tests/engine/test_policy_loader.py` (7 tests), `test_policy_evaluator.py` (11 tests including `test_allow_person_alone_not_applied_when_combined`) |
| **Sanitizer (type-based, engine side)** | Phase 3a | **Implemented** | `tests/engine/test_sanitizer.py` (9 tests including `test_spending_patterns_utility_preservation`), `test_api_analyze.py`, `test_privacy_invariants_strong.py` |
| **Extension–Engine Integration** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` — engine at `127.0.0.1:8765` with Bearer token; fail-closed on 401 verified in Part C |
| **Shadow DOM Review Overlay** | Phase 3b | **Implemented** | `tests/e2e/scenarios.spec.ts` (scenario:block, scenario:xss, scenario:emoji, scenario:untrusted-click); `tests/e2e/enforcement-full-chain.spec.ts` Part A |
| **Pre-Submission Approval Flow** | Phase 3b | **Implemented** | `tests/e2e/scenarios.spec.ts` (scenario:sent-text-click, scenario:sent-text-enter, scenario:edit-sends-nothing, scenario:cancel-sends-nothing, scenario:double-enter) |
| **Session Vault** | Phase 3b | **Implemented** | `tests/e2e/scenarios.spec.ts` (scenario:vault-consistency) |
| **Metadata-Only Audit Log** | Phase 3b | **Implemented** | `tests/e2e/scenarios.spec.ts` (scenario:metadata-events, scenario:storage-privacy) — raw text absent from `chrome.storage.local` |
| **Full-Chain 14-Cell Enforcement Benchmark** | Phase 3b | **Implemented** | `bench/results/enforcement_full_chain_mock_site.json` — 0 leaks across 280 flagged trials (14 cells × 20 trials), all 14 cells status: "pass" in 2 consecutive runs |
| **Options Page & Token Entry** | Phase 3b | **Implemented** | `extension/src/options/Options.tsx` — Bearer token password input, profile selector, Test Connection, Clear All Vaults confirmed present in source; token sourced from `chrome.storage.local.get("vg_token")` (no hardcoded tokens) |
| **Protection State Badge** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` — badge element `#veilguard-badge-host` verified present in all DOM cells |
| **Privacy Dashboard (metadata only)** | Phase 3c | **Implemented** | `tests/e2e/dashboard-popup.spec.ts` (Tests 1, 2, 3, 4, 8, 9, 11, 12 — summary cards, percentiles, SVG charts, 1000-event render, zero external egress) |
| **Popup Status** | Phase 3c | **Implemented** | `tests/e2e/dashboard-popup.spec.ts` (Test 10 — connected, active profile, protected on mock site, engine unreachable when down, not active on about:blank) |
| **Event Export and Clear** | Phase 3c | **Implemented** | `tests/e2e/dashboard-popup.spec.ts` (Tests 5, 6 — whitelist-only JSON/CSV download, two-click confirmation purge) |
| **Recording Pause Switch** | Phase 3c | **Implemented** | `tests/e2e/dashboard-popup.spec.ts` (Test 7 — pause stops event recording while review overlay and interception remain active) |
| **Task Intent & Necessity Matrix** | Phase 5 | **Planned** | — |
| **Quasi-Identifier & Re-ID Scorer** | Phase 5 | **Planned** | — |
| **Utility-Preserving Sanitizer (task-aware)** | Phase 5 | **Planned** | — |
| **Target AI Site Adapter** | Phase 4 | **Planned** | — |
| **Reproducible Benchmark Suite** | Phase 6 | **Planned** | — |
| **PyMuPDF Document Redaction** | Phase 7 | **Planned** | — |
| **Vault & Response Rehydration** | Phase 8 | **Planned** | — |
