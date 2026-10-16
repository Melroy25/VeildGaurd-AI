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

## Phase 2: Detection Engine
- **Scope:** Python engine `/scan` endpoint integrating Microsoft Presidio, spaCy `en_core_web_sm`, custom Indian recognizers with checksums (Aadhaar with Verhoeff, PAN, UPI, IFSC, GSTIN), API secrets detector, and synthetic unit test suites.
- **Done When:** Automated tests verify detection of both standard and regional identifiers with zero unhandled exceptions on edge cases.

---

## Phase 3: Policy, Sanitizer, Review UI
- **Scope:** Declarative YAML policy engine, session placeholder vault, in-DOM Shadow DOM review overlay with diff visualization, and metadata-only React options dashboard.
- **Done When:** End-to-end flow allows user review, manual approval/override, and records metadata-only logs to dashboard storage.

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
