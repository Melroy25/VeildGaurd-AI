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
- **Scope:** Declarative YAML policy engine with schema validation, destination trust mapping (`policies/destinations.yaml`), 3 default profiles (`personal`, `company`, `finance`), deterministic decision precedence (`allow` < `redact` < `require_approval` < `block`), type-based utility-preserving sanitizer with consistent placeholders (`[PERSON_1]`, `[PHONE_1]`), mask, remove, `known_placeholders` seeding, post-sanitization re-scan verification, UTF-16 code unit offset alignment, `POST /analyze` and `GET /policy/profiles` endpoints.
- **Done When:** Automated test suite asserts policy decision matrix across all profiles, all 10 sanitizer invariants (including reversible round-trip rehydration, separator-preserving masking, Unicode/emoji safety), fail-closed schema validation on invalid policies, strong logging privacy (zero submitted text in logs), and manual `/analyze` on canonical example and secret prompts.
- **Verification:** 69 engine tests pass, 3 xfail (known spaCy limitations). Zero unhandled exceptions. Fail-closed on invalid policy verified. UTF-16 code-unit offsets slice exact characters in JS encoding.

---

## Phase 3b: Extension Integration, Review UI & Dashboard (Planned)
- **Scope:** Extension background service worker calls `/analyze`, in-DOM isolated Shadow DOM review overlay visualizing original vs sanitized diff, explicit human confirmation for `require_approval` or `redact`, session placeholder vault in `chrome.storage.session`, options page token entry, and metadata-only React audit dashboard.
- **Done When:** End-to-end browser flow allows user review, manual approval/override, and records strictly metadata-only logs to dashboard storage without storing raw prompt content.


---

## Phase 4: Real AI Site Adapter
- **Scope:** Production-ready adapter targeting one real AI chat website (e.g., ChatGPT / Claude), covering all input and submission vectors, self-testing mechanisms, and the "Protection Active / Inactive" badge.
- **Done When:** Manual and automated runs confirm reliable interception and measurable pass rates on live or recorded DOM snapshots.

---

## Phase 5: Context Intelligence
- **Scope:** Context feature extraction (window tokens, entity roles), task profile inference (code, writing, analytics), task-necessity matrix scoring, and quasi-identifier combination re-identification scoring.
- **Done When:** Engine demonstrates differential redaction based on inferred task intent (e.g., retaining monetary values while masking personal identifiers for financial tasks).

---

## Phase 6: Benchmark
- **Scope:** Synthetic benchmark dataset with rigorous dev/test split, comparing VeilGuard against a keyword-matching baseline and vanilla Presidio across precision, recall, latency, and utility retention.
- **Done When:** Fully reproducible benchmark script outputs verifiable metrics JSON and latency tables in `bench/results/`.

---

## Phase 7: PDF Scan and Redaction
- **Scope:** PDF document inspection and vector/raster redaction using PyMuPDF (`fitz`), accompanied by an automated post-redaction text re-extraction verification test.
- **Done When:** PyMuPDF redaction produces sanitized PDFs where extracted text guarantees zero presence of targeted sensitive strings.

---

## Phase 8: Polish and Submission
- **Scope:** Client-side response rehydration from the session vault, finalized documentation and known limitations, recorded demonstration scripts, and presentation materials.
- **Done When:** Live demonstration functions smoothly end-to-end with verified claims and honest boundary disclosures.
