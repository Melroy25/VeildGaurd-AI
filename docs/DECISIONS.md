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

### 14. UTF-16 Code-Unit Offset Conversion in API Layer
- **Date:** Phase 3a
- **Context:** JavaScript strings index by UTF-16 code units, whereas Python strings index by Unicode code points. Characters outside the Basic Multilingual Plane (e.g., emojis `U+1F600` 😀) take 1 code point in Python but 2 code units in JavaScript. Directly using Python offsets caused incorrect substring slicing in Chrome extension content scripts.
- **Decision:** Retain Unicode code point indexing internally for detector and sanitizer string operations, but convert all finding and replacement start/end offsets to UTF-16 code units in the API serialization layer (`convert_findings_to_utf16()`). Add explicit `"offset_unit": "utf16"` property to API responses.
- **Rationale:** Eliminates slice offset desynchronization across the Python/TypeScript boundary without compromising Python standard library string slice ergonomics.

### 15. Declarative YAML Policy DSL Scope
- **Date:** Phase 3a
- **Context:** Policy rules need to map sensitive finding classifications to actionable privacy decisions (`allow`, `redact`, `require_approval`, `block`). Using Python code or `eval()` in policy files introduces code execution vulnerabilities.
- **Decision:** Implement a strictly declarative YAML schema validated by Pydantic with `extra="forbid"`. Rules specify structured conditions (`when`), combination requirements (`requires_any`), exclusions (`requires_none`), and actions (`then`).
- **Rationale:** Guarantees zero code execution risk, enables auditing by security teams, and allows straightforward UI rendering in dashboard settings.

### 16. Combination Requirements (`requires_any` and `requires_none`)
- **Date:** Phase 3a
- **Context:** Some entities (like personal names) are benign in isolation, but pose critical re-identification risks when combined with identifiers (phone, email, ID). Additionally, personal profiles may require approval for isolated phone numbers but mandate redaction when linked with a name.
- **Decision:** Implement `requires_any` (fires only if another finding matches a selector) and `requires_none` (rule does not fire if a forbidden finding exists). Support `also_apply_to_requires` to apply identical actions to both entities.
- **Rationale:** Enables fine-grained contextual combination policies without requiring complex graph queries or full syntactic parsers.

### 17. Strongest-Wins Resolution for Decisions and Actions
- **Date:** Phase 3a
- **Context:** When multiple policy rules match a single text submission or finding, conflicting decisions and actions must be resolved deterministically.
- **Decision:** Enforce fixed numeric precedence:
  - Decisions: `allow` (1) < `redact` (2) < `require_approval` (3) < `block` (4).
  - Actions: `keep` (1) < `pseudonymize` (2) < `mask` (3) < `remove` (4).
- **Rationale:** Safety invariant. The most restrictive security posture always wins, ensuring a permissive rule cannot accidentally downgrade a critical block or redaction directive.

### 18. Default Destination Trust Tiering
- **Date:** Phase 3a
- **Context:** Policies must vary based on where prompt submissions are directed (e.g. internal enterprise endpoint vs unverified external AI).
- **Decision:** Map hostnames to three tiers (`trusted`, `standard`, `untrusted`) in `policies/destinations.yaml`. Map `127.0.0.1` and `localhost` to `standard` (mirroring public AI chat behavior during testing), and default unknown destinations to `standard`.
- **Rationale:** Realistic local testing environment that mirrors commercial cloud chat interfaces without special-casing loopback traffic.

### 19. Stateless Engine with `known_placeholders` Seeding
- **Date:** Phase 3a
- **Context:** Multi-turn conversations require consistent pseudonymization across turns (e.g., `Rahul Sharma` should remain `[PERSON_1]` in message 2). However, maintaining state inside the local Python engine complicates scalability and lifecycle recovery.
- **Decision:** Keep the Python engine strictly stateless. The browser extension maintains the session vault and passes previously assigned mappings via `known_placeholders: [{entity_type, value, placeholder}]` in `POST /analyze`. The engine reuses existing placeholders and increments counters past the highest existing index.
- **Rationale:** Keeps engine architecture purely functional and deterministic, eliminating memory leaks and session persistence bugs across engine restarts.

### 20. Post-Sanitization Re-Scan Verification
- **Date:** Phase 3a
- **Context:** To verify that sanitization was effective and did not leave residual sensitive entities or introduce malformed tokens, verification is necessary.
- **Decision:** Re-scan the output `sanitized_text` with the engine detector suite, filter out known generated placeholders (`[PERSON_1]`, `[SECRET_REMOVED]`), and report residual counts and types in `verification: SanitizeVerification`.
- **Rationale:** Provides tangible automated verification that sanitization succeeded before data is transmitted.

### 21. Fail-Closed Policy Loading
- **Date:** Phase 3a
- **Context:** If a policy configuration contains errors, falling back to a default permissive state could leak uninspected sensitive data.
- **Decision:** `PolicyRegistry` validates all profiles on engine initialization. If any profile has invalid syntax, unknown fields, unknown decisions, or if the default `company` profile is missing, the engine raises an unhandled exception and halts startup.
- **Rationale:** Enforces Security Rule 6 (Fail closed). The engine never serves traffic under invalid or corrupt policy configurations.

### 22. Presidio Predefined Recognizers Fact-Check and Dual Baseline Strategy
- **Date:** Phase 3b (Task 0)
- **Context:** An architectural assumption was that Microsoft Presidio has zero built-in Indian entity recognizers. Codebase verification revealed that Presidio does provide country-specific predefined recognizers (`InPanRecognizer`, `InAadhaarRecognizer`, `InGstinRecognizer`, `InPassportRecognizer`, `InVehicleRegistrationRecognizer`, `InVoterRecognizer` under `presidio_analyzer.predefined_recognizers.country_specific.india.*`). However, `AnalyzerEngine().registry` only instantiates US and global recognizers by default; country-specific recognizers are dormant and disabled unless explicitly registered.
- **Decision:** Document this distinction transparently. In Phase 6 benchmarks, VeilGuard will be evaluated against two distinct baselines:
  1. *Presidio Out-of-the-Box:* Standard default `AnalyzerEngine()` registry without customization.
  2. *Presidio Full-Stock:* `AnalyzerEngine()` with its built-in Indian recognizers explicitly registered.
- **Rationale:** Adheres to Honesty Rule 1. VeilGuard introduces checksum verification (Verhoeff algorithm for Aadhaar, mod-36 for GSTIN, PAN 4th character structure), context-window gating for bank accounts, and unified overlap resolution that Presidio's standalone pattern recognizers do not provide.

### 23. Entity Span Normalization for Possessives and Boundary Punctuation
- **Date:** Phase 3b (Task 0)
- **Context:** spaCy's statistical NER model tokenizes possessives into entity spans (e.g., `Rahul Sharma's` is tagged as a single `PERSON` entity). Replacing the span directly results in `[PERSON_1]` replacing the whole possessive token rather than preserving the possessive `'s` (destroying grammar to `Analyze customer [PERSON_1] account...`), and creates mismatching placeholders between `Rahul Sharma` and `Rahul Sharma's`.
- **Decision:** Implement `normalize_finding_span()` in `engine/veilguard_engine/scanner.py` controlled by `NORMALIZE_SPANS = True`. For `PERSON` and `LOCATION` findings, trim trailing possessives (`'s`, `’s`, `'`) and surrounding punctuation, adjusting `start` and `end` offsets before overlap resolution, policy evaluation, and API serialization.
- **Rationale:** Preserves natural language grammar in sanitized prompts (`Analyze customer [PERSON_1]'s account...`), guarantees consistent entity values for session-vault placeholder hashing, and maintains exact character slice bounds.

### 24. Vitest for Fast In-Memory Unit Testing
- **Date:** Phase 3c (Part A)
- **Context:** Phase 3c introduces extensive pure data transformation logic (event filtering, percentiles, aggregation, retention limits, serialization queues) that requires fast, isolated testing of edge cases without spinning up a full Chromium browser.
- **Decision:** Add `vitest` as a devDependency with `npm run test:unit` running headless in Node.js. Include in GitHub Actions CI workflow.
- **Rationale:** Playwright E2E browser runs take 1–2 minutes; Vitest tests run in ~200ms, enabling instantaneous TDD verification of mathematical aggregation and security whitelists.

### 25. Storage Injection Interface for Events Store
- **Date:** Phase 3c (Part A)
- **Context:** Hardcoding `chrome.storage.local` calls directly inside business logic makes automated testing dependent on browser mocking plugins.
- **Decision:** Define a lightweight `StorageArea` interface (`get(keys)`, `set(items)`) and allow custom storage injection into `EventsStore`.
- **Rationale:** Enables pure in-memory `MemoryStorage` in unit tests while defaulting to `chrome.storage.local` in production extension builds.

### 26. Serialized Promise Queue for Extension Storage Writes
- **Date:** Phase 3c (Part A)
- **Context:** Rapid consecutive submissions or concurrent interception events can trigger race conditions in `chrome.storage.local` read-modify-write operations, leading to lost events.
- **Decision:** Implement a FIFO promise queue in `EventsStore.appendEvent()` that serializes all store operations so each write completes before the next read commences.
- **Rationale:** Guarantees zero dropped events during rapid message sending or multi-tab usage.

### 27. Write-Time and Read-Time Runtime Whitelisting
- **Date:** Phase 3c (Part A & B)
- **Context:** TypeScript types vanish at runtime. Storing arbitrary JSON objects could allow prompt text, raw entity values, or malicious payloads to be injected into `chrome.storage.local` and rendered in the dashboard.
- **Decision:** Enforce a strict runtime whitelist function `sanitizeEvent(raw)` that strips all unrecognized keys, enforces strict regex on `rule_ids`, validates numeric bounds, and rejects free-text fields. Apply at write time (`appendEvent`) and read time (`filterEvents`).
- **Rationale:** Upholds Rule 7 (Metadata-only audit logs) and prevents XSS/injection attacks from corrupted storage.

### 28. Nearest-Rank Method for Percentile Latency Calculation
- **Date:** Phase 3c (Part A)
- **Context:** Percentile calculations (median, P95) have multiple mathematical formulations across libraries (interpolated vs nearest-rank).
- **Decision:** Implement the NIST / Wikipedia standard nearest-rank percentile formula: `rank = ceil((P / 100) * N)`, picking index `rank - 1` from sorted non-negative values.
- **Rationale:** Deterministic, reproducible, matches industry standards, and requires zero external statistics dependencies.

### 29. Hand-Crafted Responsive SVG and CSS Charts Without Third-Party Libraries
- **Date:** Phase 3c (Part B)
- **Context:** Third-party charting libraries (Chart.js, Recharts, D3) introduce heavy bundle bloat (100–300 kB), external dependencies, and potential DOM sanitization vulnerabilities.
- **Decision:** Implement all dashboard visualizations (daily activity bar chart, decision breakdown, category breakdown, user choice distributions) using pure semantic HTML, Tailwind CSS flex bars, and inline SVG elements.
- **Rationale:** Keeps extension bundle ultra-lightweight (<30 kB), zero external runtime dependencies, 100% accessible with text equivalents, and full dark mode compatibility via `prefers-color-scheme`.

### 30. Popup Status Verification Without Privileged `tabs` Permission
- **Date:** Phase 3c (Part C)
- **Context:** Querying tab status typically prompts extensions to request the broad `"tabs"` permission in `manifest.json`.
- **Decision:** Avoid requesting `"tabs"`. In the action popup, determine active page status by sending a `GET_STATUS` message via `chrome.tabs.sendMessage` to the active tab ID obtained from `chrome.tabs.query({ active: true, currentWindow: true })`.
- **Rationale:** Strictly adheres to Rule 9 (Least Privilege). The popup obtains protection status without needing to read browsing history or URLs of all open tabs.

### 31. `?tabId=<n>` Popup Test Seam (Task 0, Phase 4)
- **Date:** Phase 4 (Task 0)
- **Context:** Phase 3c introduced a `chrome.tabs.getCurrent` heuristic inside `Popup.tsx` that detected when the popup was running in a browser tab (as opposed to the toolbar action bubble) and then picked the "last sibling tab" as the target for the `GET_STATUS` query. This was test-harness logic in production code: it only existed because Playwright opens `popup.html` as a full tab, not as the toolbar action popup.
- **Decision:** Remove the `chrome.tabs.getCurrent` heuristic entirely. Production code always uses `chrome.tabs.query({ active: true, currentWindow: true })`. Tests that need to target a specific tab open `popup.html?tabId=<n>` and parse the `tabId` URL parameter to call `chrome.tabs.sendMessage` on that tab ID directly.
- **Rationale:** Eliminates test-harness logic from the production code path. The `?tabId=` seam is explicit and documented, making the test intent clear without obscure runtime branching.

### 32. Event-Context Adapter API for Real AI Sites (Phase 4)
- **Date:** Phase 4 (Part B)
- **Context:** Real AI sites (ChatGPT) use React-controlled textareas and ProseMirror editors. Simple DOM reads at event time can return stale, pre-input values due to React's batched synthetic event processing. Additionally, real-site endpoint patterns differ between authenticated and unauthenticated states (`/backend-api/conversation` vs `/unauth-mweb/conversation/updates`), and different DOM layouts exist for mobile and desktop views.
- **Decision:** Define a `SiteAdapter` interface with `resolveContext(event)` returning a `ComposerContext` (`{ text, composerEl, sendButtonEl }`). Each adapter resolves the composer text synchronously at event-time using the closest structural ancestor of the event target. The backstop (`page-world/index.ts`) intercepts all endpoint patterns via a single union regex: `/(backend-api|backend-anon|unauth-mweb)\/conversation/`.
- **Rationale:** Event-time resolution avoids timing races between React re-renders and DOM reads. The regex union future-proofs against OpenAI endpoint migrations without requiring adapter code changes.

### 33. React `_valueTracker` Reset for Controlled Textarea (Phase 4)
- **Date:** Phase 4 (Part B)
- **Context:** When VeilGuard writes sanitized text back into ChatGPT's textarea (to re-submit after user approval), directly setting `element.value = text` leaves React's internal `_valueTracker` snapshot at the old value. React then computes a zero-delta change event and keeps the send button disabled, causing the re-submission to silently fail.
- **Decision:** Implement a three-step write sequence in `ChatGPTAdapter.setText()`: (1) clear the `_valueTracker` snapshot via `element._valueTracker?.setValue("")`, (2) assign `element.value = text`, (3) dispatch a synthetic `InputEvent` with `inputType: "insertText"` and the new text as `data`. This causes React to detect a transition from `""` to `text` and re-enable the submit button.
- **Rationale:** This is the canonical pattern for programmatically updating React-controlled `<input>` and `<textarea>` elements without forking React internals. Accessing `_valueTracker` is a known, stable React internal (present since React 16). The fallback (`createNativeInputValueSetter`) is also implemented in case `_valueTracker` is absent in a future React version.
