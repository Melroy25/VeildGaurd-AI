# VeilGuard AI: Context-Aware Privacy Firewall for AI Tools

> **DevHack 2026 Submission** | **Track:** Problem Statement 2.2 — Context-Aware Data Privacy under Responsible AI  
> **Team:** Team Vexora  
> **Repository:** `[HUMAN FILL: Public GitHub URL]` | **Video Demonstration:** `[HUMAN FILL: 4-Minute Video Link]`

---

## What is VeilGuard AI?

**VeilGuard AI** is a real-time, context-aware privacy firewall designed to sit between users and AI interfaces (such as ChatGPT, Claude, or internal LLM endpoints). 

When users paste sensitive text—customer conversations, medical notes, financial identifiers, or code containing secrets—VeilGuard intercepts the submission directly inside the browser, evaluates context-dependent privacy risks on a local loopback engine (`127.0.0.1:8765`), enforces deterministic policy actions, generates utility-preserving pseudonymized prompts, and maintains strictly metadata-only audit logs.

```
[User Submits Prompt] ──▶ [DOM Intercept (Capture Phase)] ──▶ [Local Engine Analysis (Loopback)]
                                                                          │
[AI Receives Sanitized Text] ◀── [Fetch Backstop Bridge] ◀── [Review Overlay & User Confirmation]
```

### The 5-Line Core Flow:
1. **Intercept:** The Chrome extension intercepts the DOM submission (Enter / Send button click) before any network request is created.
2. **Analyze Locally:** The local engine classifies entities, infers task necessity, and calculates quasi-identifier re-identification risk in <40ms.
3. **Decide Deterministically:** Configurable declarative policies evaluate the risk to assign a deterministic verdict: `allow`, `redact`, `require_approval`, or `block`.
4. **Sanitize & Pseudonymize:** Non-essential sensitive attributes are replaced with utility-preserving role placeholders (`[CUSTOMER_1]`, `****-1234`) maintained across turns by an in-memory session vault.
5. **Enforce & Log:** The user reviews the side-by-side diff in a Shadow DOM overlay; upon confirmation, the sanitized text is delivered through a hardened fetch backstop while metadata-only audit logs are recorded.

---

## Headline Empirical Results (Sealed Benchmark Split)

All figures below are sourced directly from verified test artifacts in `bench/results/benchmark_test.json` on a frozen, cryptographically sealed test corpus (N=286 records, strictly synthetic):

| System | Entity F1 (50% IoU) | Exact Entity F1 | Flagged Precision | Flagged Recall | False Positive Rate (FPR) | Quasi-ID Combo Recall | Required Retained |
|---|---|---|---|---|---|---|---|
| **Regex Baseline** | 56.3% | 51.4% | 97.3% | 79.2% | 3.9% | 17.1% | 96.7% |
| **Microsoft Presidio** | 22.6% | 22.3% | 60.5% | 72.7% | 84.5% | 97.1% | 63.5% |
| **VeilGuard (Type-Based)** | 43.4% | 41.3% | 100.0% | 56.8% | 0.0% | 0.0% | 100.0% |
| **VeilGuard AI (Full Intelligence)** | **73.2%** | **65.3%** | **100.0%** | **84.2%** | **0.0%** | **80.0%** | **100.0%** |

*Note on FPR & Combination Recall:* VeilGuard achieves 0.0% FPR (0 of 103 benign items flagged, 95% Wilson CI [0.0%, 3.6%]) through the combination of deterministic policy rules (`allow_person_alone`, `allow_benign_code`), checksum validation, and task necessity gating (not checksums alone). Stock Presidio's 97.1% combination recall is driven by an 84.5% false positive rate (flagging 87 of 103 benign prompts indiscriminately), whereas VeilGuard achieves 80.0% combination recall with zero false positives. Full methodology in [docs/EVIDENCE.md](./docs/EVIDENCE.md) and [bench/results/BENCHMARK.md](./bench/results/BENCHMARK.md).

---

## One-Command Quickstart

VeilGuard AI provides automated setup scripts that configure the Python virtual environment, download NLP models, install Node dependencies, build the extension, and verify smoke tests with zero manual friction:

### On Windows (PowerShell):
```powershell
.\scripts\setup.ps1
```

### On macOS / Linux / WSL:
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

---

## Manual Step-by-Step Instructions

If you prefer running setup steps manually:

### 1. Prerequisites
- **Python:** 3.10, 3.11, 3.12, 3.13, or 3.14 (64-bit)
- **Node.js:** v18.x or higher (v20+ recommended) & npm
- **Google Chrome** (or Chromium-based browser)

### 2. Python Engine Setup
```bash
# Create and activate virtual environment
python -m venv .venv

# Activate:
# On Windows: .\.venv\Scripts\Activate.ps1
# On Linux/macOS: source .venv/bin/activate

# Install dependencies and spaCy language model
pip install --upgrade pip
pip install -r engine/requirements.txt -r engine/requirements-dev.txt
python -m spacy download en_core_web_sm
```

### 3. Extension Build
```bash
npm install
npm run build
```

### 4. Running the Stack
1. **Start the local loopback engine (127.0.0.1:8765):**
   ```bash
   python -m veilguard_engine.server
   ```
2. **Start the mock AI chat testbed (127.0.0.1:4310):**
   ```bash
   npm run mock-site
   ```
3. **Load the Extension into Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** (toggle in upper right).
   - Click **Load unpacked** and select the `extension/dist` directory.
4. **Visit the testbed:**
   - Open `http://127.0.0.1:4310/` to test prompt interception, review overlays, and sanitized delivery.
   - Click the extension icon or right-click -> Options to view the **Metadata-Only Privacy Dashboard**.

---

## Project Status Matrix

Feature status is strictly tracked in [docs/STATUS.md](./docs/STATUS.md) per Rule 2:

| Phase / Feature Area | Scope & Description | Status | Verification Artifact |
|---|---|---|---|
| **Phase 1: Mock Testbed** | Deterministic mock AI site, composers, form/click handlers | **Implemented** | `mock-ai-site/` (Passing in E2E) |
| **Phase 2: Detection Engine** | Presidio, Indian ID validators (Aadhaar, PAN, GSTIN), Secrets | **Implemented** | `pytest tests/engine/` (155 passing) |
| **Phase 3a: Policy & Sanitizer**| Declarative YAML policies, utility-preserving role placeholders | **Implemented** | `engine/veilguard_engine/policy/` |
| **Phase 3b: Browser Enforcement**| Review overlay, session vault, dual fetch backstop (14-cell matrix)| **Implemented** | `tests/e2e/scenarios.spec.ts` (25/25) |
| **Phase 3c: Audit Dashboard** | Metadata-only dashboard, summary cards, SVG charts, JSON export | **Implemented** | `tests/e2e/dashboard-popup.spec.ts` |
| **Phase 4: Adapter & Real Site**| ChatGPT adapter, degraded mode, canary monitor, route harness | **Implemented** | `bench/results/enforcement_real_site.json`|
| **Phase 5: Context Intelligence**| Task inference, necessity reducer, quasi-ID re-ID scoring | **Implemented** | `bench/results/benchmark_test.json` |
| **Phase 6: Submission Essentials**| Setup scripts, evidence generator, Mermaid diagrams, demo runner | **Implemented** | `scripts/make_evidence.py`, `docs/` |

---

## Scientific Honesty & Known Boundaries

> **Rule 1 & Rule 3 Invariants:** We never fabricate benchmark metrics or claim 100% protection. Known technical boundaries are openly documented in [docs/LIMITATIONS.md](./docs/LIMITATIONS.md):

1. **Statistical NER Sensitivity:** Compact offline statistical models (`en_core_web_sm`) require capitalization and grammatical cues; lowercased or transliterated regional names lacking context can be missed.
2. **Isolated Numeric Ambiguity:** A bare 10-digit number without semantic context cannot be definitively separated from an internal tracking ID.
3. **Scanned Raster PDFs:** Document scanning operates on vector and text-layer streams; image-only scanned PDFs require an upstream OCR engine.
4. **Insider Malice:** VeilGuard defends against inadvertent employee exposure and software vulnerabilities. An insider with browser dev tools or operating system access can intentionally bypass client software.

---

## Comprehensive Test Commands

All test suites can be executed independently:

```bash
# Python Engine Tests (158 tests: 155 passed, 3 documented xfail)
pytest -rx

# Pure In-Memory Extension Unit Tests (28 tests)
npm run test:unit

# TypeScript Static Typecheck (strict typing, 0 errors)
npm run typecheck

# Extension Production Build
npm run build

# End-to-End Browser Scenarios (25 scenarios)
npx playwright test tests/e2e/scenarios.spec.ts

# Live Demo Rehearsal & High-Res Screenshot Generation
npx playwright test tests/e2e/demo-rehearsal.spec.ts

# Benchmark Evaluation on Development Split (N=233)
python -m bench.run_benchmark --split dev --systems all

# Generate / Verify Evidence Report
python scripts/make_evidence.py --check
```

---

## Key Deliverables & Documentation Links

- **Evidence & Verification Report:** [docs/EVIDENCE.md](./docs/EVIDENCE.md)
- **Detailed Benchmark Report:** [bench/results/BENCHMARK.md](./bench/results/BENCHMARK.md)
- **4-Minute Demo Script:** [docs/DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md)
- **Presentation Deck Content (8 Slides):** [docs/PPT_CONTENT.md](./docs/PPT_CONTENT.md)
- **Submission Readiness Checklist:** [docs/SUBMISSION_CHECKLIST.md](./docs/SUBMISSION_CHECKLIST.md)
- **Architecture & Sequence Diagrams:** [docs/diagrams/README.md](./docs/diagrams/README.md)
- **Project Rules & Invariants:** [AGENTS.md](./AGENTS.md)
- **Known Limitations:** [docs/LIMITATIONS.md](./docs/LIMITATIONS.md)
- **Architectural Decisions Log:** [docs/DECISIONS.md](./docs/DECISIONS.md)
