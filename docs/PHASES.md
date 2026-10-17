# VeilGuard AI: Phase Roadmap

---

## Phase 0: Setup (Complete)
- **Scope:** Repository structure, project rules (`AGENTS.md`), documentation, Python environment, FastAPI skeleton with `/health` endpoint, TypeScript extension scaffold that builds, Playwright smoke test, CI configuration.
- **Done When:** `pytest` passes smoke tests, the extension builds with Vite, and Playwright loads the extension and verifies the popup.

---

## Phase 1: Enforcement Spike (Complete)
- **Scope:** Standalone mock AI chat web application + extension content script that intercepts and blocks "Send" button clicks and "Enter" key submissions + MAIN-world fetch/XHR backstop.
- **Done When:** Playwright automated test proves that sensitive original prompt text never reaches the mock server across DOM and programmatic paths. (Verified: 240 trials in `bench/results/enforcement_mock_site.json`, 0 leaked).

---

## Phase 2: Detection Engine (Complete)
- **Scope:** Python engine `/scan` endpoint integrating Microsoft Presidio, spaCy `en_core_web_sm`, custom Indian recognizers with checksums (Aadhaar with Verhoeff, PAN, UPI, IFSC, GSTIN), API secrets detector, and synthetic unit test suites.
- **Done When:** Automated tests verify detection of both standard and regional identifiers with zero unhandled exceptions on edge cases.
- **Verification:** 34 tests pass, 3 xfail (documenting known `en_core_web_sm` limitations). Zero unhandled exceptions. Privacy invariant (Rule 7 — no raw text in responses or logs) verified by dedicated test. API security invariants (loopback binding, Bearer token auth, Origin enforcement, 422 error sanitization) all verified.

---

## Phase 3a: Policy Engine & Sanitizer (Complete)
- **Scope:** Declarative YAML policy engine with schema validation, destination trust mapping (`policies/destinations.yaml`), 3 default profiles (`personal`, `company`, `finance`), deterministic decision precedence (`allow` < `redact` < `require_approval` < `block`), type-based sanitizer with consistent placeholders (`[PERSON_1]`, `[PHONE_1]`), mask, remove, `known_placeholders` seeding, post-sanitization re-scan verification, UTF-16 code unit offset alignment, `POST /analyze` and `GET /policy/profiles` endpoints.
- **Done When:** Automated test suite asserts policy decision matrix across all profiles, all 10 sanitizer invariants (including reversible round-trip rehydration, separator-preserving masking, Unicode/emoji safety), fail-closed schema validation on invalid policies, strong logging privacy (zero submitted text in logs), and manual `/analyze` on canonical example and secret prompts.
- **Verification:** 74 engine tests pass, 3 xfail (known spaCy limitations). Zero unhandled exceptions. Fail-closed on invalid policy verified. UTF-16 code-unit offsets slice exact characters in JS encoding.

---

## Phase 3b: Extension + Engine Integration & Review Flow (Complete)
- **Scope:** Extension background service worker calls engine `/analyze`, in-DOM isolated Shadow DOM review overlay visualizing original vs sanitized diff, explicit human confirmation for `require_approval` or `redact`, session placeholder vault in `chrome.storage.session`, options page token entry, metadata-only event recording ring buffer, and engine-backed MAIN-world backstop.
- **Done When:** Automated Playwright end-to-end tests verify pre-submission hold, review overlay interaction, sanitized delivery, and engine-backed backstop across DOM and programmatic paths on the mock site with zero leaks.
- **Verification:** 14-cell enforcement benchmark passed with 0 leaks across 280 flagged trials (20 trials/cell). All 15 scenario tests pass.

---

## Phase 3c: Metadata Dashboard + Popup Status (Complete)
- **Scope:** Privacy dashboard on the options page and quick status in the popup. Pure aggregation logic (`summarize()`), runtime whitelist (`sanitizeEvent`), serialized write queue, 1000-event ring buffer, recording pause switch, two-click history clear, whitelist-only JSON/CSV export, SVG/CSS bar charts, and active-tab status detection without the `tabs` permission.
- **Done When:** Automated unit and E2E tests verify pure aggregation math, runtime sanitization, dashboard filtering, pause behavior, storage and export privacy, popup states, and offline CSP compliance.
- **Verification:** 28 Vitest unit tests pass in 212ms. 36 Playwright E2E tests pass in 1.4m. Honest screenshots generated from real-flow mock site runs (`docs/screenshots/`).

---

## Phase 4: Real AI Site Adapter (Planned)
- **Scope:** Production-ready adapter targeting one real AI chat website (e.g., ChatGPT / Claude), covering all input and submission vectors, self-testing mechanisms, and the "Protection Active / Inactive" badge.
- **Done When:** Manual and automated runs confirm reliable interception and measurable pass rates on live or recorded DOM snapshots.

---

## Phase 5: Context Intelligence & Sealed-Test Benchmark (Complete)
- **Scope:** 
  1. Synthetic evaluation dataset (233 dev, 286 sealed test) with SHA-256 manifest verification.
  2. Baselines (`keyword`, `presidio_default`, `presidio_all_stock`, `veilguard_type_based`, `veilguard_full`) and reproducible runner with Wilson score confidence intervals and automated failure publishing.
  3. Context Intelligence: lexical task inference (`T_ANALYZE_01`...), YAML necessity matrix with safety invariants, role-based placeholders (`[CUSTOMER_1]`), quasi-identifier detection and heuristic Noisy-OR re-identification scoring, utility-maximizing heuristic reducer (`ReidReducer`), and 252-term medical term detection (`HEALTH_WITH_IDENTITY`).
  4. Minimal extension surface: Shadow DOM overlay "Why" section, Options page bundled benchmark summary panel, and end-to-end scenarios for customer analysis and HR combination re-identification.
- **Done When:** All acceptance criteria met: `pytest` passes with 155 passed and 3 xfailed (medical xfail resolved); sealed test split benchmark executed (run #1) and report generated; extension builds with bundled benchmark panel; Playwright E2E scenarios pass 25/25.
- **Verification:** 155 Python tests pass; 28 Vitest unit tests pass; 25/25 Playwright scenario tests pass; sealed test benchmark run #1 recorded with 73.2% entity F1 (+29.8% over type-based), 80.0% combo risk recall (+80.0%), and 100.0% required retention.


---

## Phase 7: PDF Scan and Redaction
- **Scope:** PDF document inspection and vector/raster redaction using PyMuPDF (`fitz`), accompanied by an automated post-redaction text re-extraction verification test.
- **Done When:** PyMuPDF redaction produces sanitized PDFs where extracted text guarantees zero presence of targeted sensitive strings.

---

## Phase 8: Polish and Submission
- **Scope:** Client-side response rehydration from the session vault, finalized documentation and known limitations, recorded demonstration scripts, and presentation materials.
- **Done When:** Live demonstration functions smoothly end-to-end with verified claims and honest boundary disclosures.
