# VeilGuard AI: Architecture & Engineering Decisions Log

This document records key technical decisions, rationales, and alternatives evaluated throughout development.

---

## Decision Log

### 1. Plain Vite Build Pipeline for Chrome Extension
- **Date:** Phase 0
- **Context:** Chrome MV3 requires content scripts and MAIN-world scripts to be standalone, self-contained IIFE (Immediately Invoked Function Expression) bundles without ES-module `import` statements at runtime. Meanwhile, the popup and options dashboard utilize React with HTML entry points.
- **Decision:** Use official Vite and `@vitejs/plugin-react` coordinated via a custom node build script (`scripts/build-extension.mjs`) executing separate Vite programmatic builds (one multi-page build for popup, options, and service worker; separate IIFE library builds for content and page-world scripts).
- **Rationale:** Avoids third-party opinionated MV3 wrapper plugins (e.g., `@crxjs/vite-plugin` or Webpack CRX plugins) which frequently break across Vite updates or introduce opaque runtime loaders. Keeps the entire build transparent and maintainable.

### 2. Exclusion of Playwright from Default CI Pipeline
- **Date:** Phase 0
- **Context:** Automated CI runs on GitHub Actions for every pull request and push.
- **Decision:** Configure `.github/workflows/ci.yml` to run Python lint/pytest and TypeScript typecheck/build, but run Playwright end-to-end tests locally or on-demand rather than on every basic CI run.
- **Rationale:** Playwright extension testing requires full Chromium browser binary installation, custom flags (`--load-extension`, `--disable-extensions-except`), and virtual displays in headless Linux CI environments. Retaining Playwright for local gate verification and staging runs prevents slow and flaky standard CI runs while still providing 100% automated local verification.

### 3. Engine Host and Port Binding
- **Date:** Phase 0
- **Context:** The local Python privacy engine must only serve local browser requests.
- **Decision:** Hardcode loopback binding to `HOST = "127.0.0.1"` and `PORT = 8765` in `engine/veilguard_engine/config.py`. Assert this binding explicitly in automated unit tests.
- **Rationale:** Enforces Security Rule 5: never bind to `0.0.0.0` or expose privacy inspection endpoints to the local area network.

### 4. Shadow DOM for Extension UI Components
- **Date:** Phase 0 (Architecture specification)
- **Context:** The review overlay must render on top of arbitrary AI host websites (ChatGPT, Claude, etc.) without having its styles overridden by host stylesheets or inadvertently leaking styles into the host page.
- **Decision:** Encapsulate all injected review overlay UI within an isolated Shadow DOM.
- **Rationale:** Complete style encapsulation and immunity to host page CSS resets or styling collisions.

### 5. Python Environment Selection
- **Date:** Phase 0
- **Context:** Prompt specifies Python 3.11 or 3.12. Host machine environment contains Python 3.14, Python 3.13.5, and Python 3.10. Python 3.11 and 3.12 are not present on the host system.
- **Decision:** Utilize Python 3.13.5 to create the virtual environment `.venv`. If any package (Presidio, spaCy, PyMuPDF) encounters wheel or build incompatibilities on 3.13, evaluate Python 3.10 or report exact errors as instructed.
- **Rationale:** Python 3.13 provides modern typing and performance while spaCy v3.8+ and PyMuPDF provide verified pre-built wheels for Python 3.13 on Windows x64.

### 6. Stub Detector for Phase 1 Enforcement Spike
- **Date:** Phase 1
- **Context:** Phase 1 requires verifying that pre-submission interception and backstop defense are 100% deterministic and reliable across all DOM paths before introducing the full Presidio/ML pipeline.
- **Decision:** Implement a lightweight, synchronous regex stub detector (`isFlagged()` in `extension/src/shared/stub-detector.ts`) matching synthetic Indian mobile phone numbers (`/\b[6-9]\d{9}\b/`), clearly marked as testbed-only.
- **Rationale:** Decouples the physical interception mechanics and backstop defense from local Python engine network latency, server availability, and statistical NER variability.

### 7. Separate Persistent Contexts for Part A and Part B E2E Tests
- **Date:** Phase 1
- **Context:** Part A tests DOM capture-phase interception across a 10-cell matrix; Part B tests programmatic API submissions via MAIN-world fetch and XHR backstops.
- **Decision:** Launch separate persistent contexts with dedicated user data profiles for Part A (`.playwright-enforcement-profile`) and Part B (`.playwright-backstop-profile`).
- **Rationale:** Chrome MV3 extension service workers and MAIN-world scripts maintain in-page execution states; isolated profiles ensure complete test isolation and eliminate cross-suite state leakage.

### 8. Native `"world": "MAIN"` Registration in `manifest.json`
- **Date:** Phase 1
- **Context:** Need to inject `page-world.js` into the host page's MAIN execution context at `document_start` to intercept `window.fetch` and `XMLHttpRequest` before host scripts run.
- **Decision:** Utilize the native Chrome Manifest V3 `"world": "MAIN"` property in `content_scripts`.
- **Rationale:** Chrome 111+ natively supports `"world": "MAIN"`, removing the need for DOM `<script>` injection hacks or CSP bypass workarounds.

### 9. Browser-Side Async Response Synchronization in Multi-Trial Harness
- **Date:** Phase 1
- **Context:** Rapid consecutive test iterations across 20 trials produced a race condition where the browser's asynchronous fetch callback `clearComposer()` executed immediately after the next trial's input had already been filled, causing the composer to be empty when Enter was pressed.
- **Decision:** In the automated test harness benign loop, await browser confirmation that the composer has been cleared (`expect(composer).toHaveValue("")` / `expect(composer).toHaveText("")`) before advancing to the subsequent trial.
- **Rationale:** Guarantees deterministic synchronization between the browser's asynchronous HTTP response lifecycle and the test driver's input generation without arbitrary sleeps.

### 10. Verhoeff Algorithm for Aadhaar Checksum Validation
- **Date:** Phase 2
- **Context:** Aadhaar numbers use the Verhoeff algorithm (published by J. Verhoeff, 1969) for their check digit. Multiple alternative check digit schemes (Luhn, Damm, ISBN-10) were considered.
- **Decision:** Implement the Verhoeff algorithm using the three published lookup tables (`d_table`, `p_table`, `inv_table`) in `engine/veilguard_engine/detectors/validators.py`.
- **Rationale:** Verhoeff is the official UIDAI-mandated algorithm for Aadhaar validation. It detects all single transposition and single digit errors. The tables are published in the original Verhoeff paper and are deterministic — no external library dependency required, satisfying Rule 14 (deterministic detection core).

### 11. Context-Keyword Requirement for IN_BANK_ACCOUNT Detection
- **Date:** Phase 2
- **Context:** Indian bank account numbers are 9–18 digit strings, overlapping heavily with phone numbers, order numbers, transaction IDs, and other numeric sequences. A raw regex without context generates excessive false positives.
- **Decision:** `IndiaDetector` requires at least one contextual keyword (e.g., "account", "acct", "bank", "savings", "current") within a ±60 character window around any `IN_BANK_ACCOUNT` match. Without a context keyword, the match is suppressed.
- **Rationale:** Context-gating dramatically reduces false positive rate on numeric strings without impacting recall on actual banking contexts, which always include account-related language. Alternative (raising score threshold alone) was insufficient because digit-count overlap is deterministic, not probabilistic.

### 12. Bearer Token Persistence Strategy
- **Date:** Phase 2
- **Context:** The `/scan` API must be authenticated to prevent other processes on the local machine from submitting arbitrary text to the privacy engine. Tokens need to persist across engine restarts so the extension does not need to be updated with new token values.
- **Decision:** Generate a 32-byte `secrets.token_urlsafe()` token on first startup, persist it to `.veilguard/token` (gitignored via `.gitignore`). Allow override via `VEILGUARD_TOKEN` environment variable. Verify with `secrets.compare_digest()` for constant-time comparison. Cache in module-level `ACTIVE_API_TOKEN` constant loaded once at import.
- **Rationale:** File persistence allows restarts without reconfiguration. Gitignore ensures no token is ever committed (Rule 11). Environment variable override supports CI and Docker deployments. `compare_digest` prevents timing-oracle attacks on token comparison.

### 13. Privacy Logging Filter Architecture
- **Date:** Phase 2
- **Context:** Presidio's `SpacyRecognizer` logs tokenized context words at DEBUG level, which can include fragments of the submitted prompt text. This violates Rule 7 (no raw content in logs).
- **Decision:** Implement `SensitiveLogFilter` in `security.py` that drops all log records from the `presidio-analyzer` logger hierarchy at DEBUG level, and additionally drops any log message containing the string `"Context list is"`. Call `configure_privacy_logging()` both at module import time (for engine startup) and inside the pytest `caplog.at_level()` context in `test_privacy_invariants.py` (to attach to pytest's dynamic handler).
- **Rationale:** A filter on the logger hierarchy is more maintainable than patching Presidio internals. Double-calling `configure_privacy_logging()` is guarded with `if log_filter not in log.filters` to prevent duplicate filter accumulation.

