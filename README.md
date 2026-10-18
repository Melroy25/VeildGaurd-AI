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

## Supported Target Sites

Per Rule 3 of `AGENTS.md`, sites are labeled **Verified** only when backed by recorded multi-trial benchmark cells ($N \ge 20$). All other targets are labeled **Prototype**:

| Target Interface | Status | Interception Mechanism | Verified Trials / Evidence |
|---|---|---|---|
| **Mock AI Chat Testbed** (`127.0.0.1:4310`) | **Verified** | Form submit, Send click, Enter key, Controlled React state, Shadow DOM backstop | **280 / 280 trials passed** (14 cells × 20 trials, 0 leaks; `bench/results/enforcement_full_chain_mock_site.json`) |
| **ChatGPT** (`chatgpt.com`) | **Prototype** | Contenteditable / ProseMirror adapter + MAIN-world fetch backstop | Unauthenticated send button + backstop verified in `bench/results/enforcement_real_site.json` |
| **Google Gemini** (`gemini.google.com`) | **Prototype** | Universal Rich-Text / Quill adapter + fetch backstop | Target selectors mapped in `universal.ts`; live benchmark pending |
| **Anthropic Claude** (`claude.ai`) | **Prototype** | ProseMirror adapter + fetch backstop | Target selectors mapped in `universal.ts`; live benchmark pending |
| **Microsoft Copilot** (`copilot.microsoft.com`) | **Prototype** | Shadow DOM / Iframe traverse adapter + fetch backstop | Target selectors mapped in `universal.ts`; live benchmark pending |
| **Perplexity AI** (`perplexity.ai`) | **Prototype** | Textarea / form submit adapter + fetch backstop | Target selectors mapped in `universal.ts`; live benchmark pending |
| **DeepSeek Chat** (`chat.deepseek.com`) | **Prototype** | Textarea adapter + fetch backstop | Target selectors mapped in `universal.ts`; live benchmark pending |

---

## Project Status Matrix

Feature status is strictly tracked in [docs/STATUS.md](./docs/STATUS.md) per Rule 2:

| Feature Component | Phase | Status | Verification Evidence |
|---|---|---|---|
| **Mock AI Chat Testbed** | Phase 1 | **Implemented** | `mock-ai-site/server.mjs`; `bench/results/enforcement_mock_site.json` |
| **Presidio & Indian ID Recognizers** | Phase 2 | **Implemented** | `pytest tests/engine/` (166 passed, 3 documented xfail) |
| **Declarative YAML Policy Engine** | Phase 3a | **Implemented** | `tests/engine/test_policy_loader.py`, `test_policy_evaluator.py` |
| **Utility-Preserving Sanitizer** | Phase 3a/5 | **Implemented** | `tests/engine/test_sanitizer.py`, `test_role_placeholders.py` |
| **DOM Capture & Dual Backstop** | Phase 3b | **Implemented** | `tests/e2e/enforcement-full-chain.spec.ts` (14/14 cells, 0 leaks) |
| **Shadow DOM Review Overlay** | Phase 3b | **Implemented** | `tests/e2e/scenarios.spec.ts` (XSS, Emoji, untrusted click protection) |
| **Metadata-Only Audit Dashboard** | Phase 3c | **Implemented** | `tests/e2e/dashboard-popup.spec.ts` (12 tests, 0 raw text persistence) |
| **Degraded Mode & Canary Alerts** | Phase 4 | **Implemented** | `tests/e2e/degraded-canary.spec.ts` (10/10 trials protected) |
| **ChatGPT Real-Site Harness** | Phase 4 | **Prototype** | `bench/results/enforcement_real_site.json` (stubbed via `page.route`) |
| **Other AI Site Adapters** | Phase 4 | **Prototype** | `extension/src/content/adapters/universal.ts` |
| **Windows Desktop Sidebar** | Phase 4 | **Prototype** | `desktop/sidebar_guard.py` (Win32 focus detection, opt-in clipboard) |
| **Task Necessity & Quasi-ID Scoring**| Phase 5 | **Implemented** | `bench/results/benchmark_test.json` (80.0% combination recall) |
| **PyMuPDF Document Redaction** | Phase 6 | **Implemented** | `tests/engine/test_pdf.py` (11 tests pass), `tests/e2e/pdf-scanner.spec.ts` |
| **Blue Glass Design System** | Part 2 | **Planned** | Frosted glassmorphism design tokens across overlay, popup, onboarding |
| **Windows App (`VeilGuard.exe`)** | Part 4 | **Planned** | PyInstaller single-directory bundle with tray daemon & Inno Setup |
| **Static Web Demo on Vercel** | Part 5 | **Planned** | Client-side deterministic playground with zero network egress |
| **Response Vault Rehydration** | Phase 7 | **Future** | Post-hackathon roadmap — client-side closed Shadow DOM rehydration |

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
# Python Engine Tests (169 tests: 166 passed, 3 documented xfail)
pytest -rx

# Pure In-Memory Extension Unit Tests (35 tests)
npm run test:unit

# TypeScript Static Typecheck (strict typing, 0 errors)
npm run typecheck

# Extension Production Build
npm run build

# End-to-End Browser Scenarios (96 tests across 6 suites)
npx playwright test

# Full-Chain 14-Cell Enforcement Benchmark (N=20)
npx playwright test tests/e2e/enforcement-full-chain.spec.ts

# Benchmark Evaluation on Development Split (N=233)
python -m bench.run_benchmark --split dev --systems all

# Generate / Verify Evidence Report
python scripts/make_evidence.py --check
```

---

## Licensing & AI Disclosure

- **AI-Assisted Development Disclosure:** Built with AI-assisted development tools; all code was reviewed, validated, and tested by the team.
- **Licensing Guidance:** Refer to [docs/LICENSING.md](./docs/LICENSING.md) for detailed analysis of PyMuPDF (AGPL-3.0) and pystray (LGPL-3.0) license considerations.
- **Third-Party Notices:** Complete third-party package credits and license terms are detailed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
- **Privacy Policy & Invariants:** See [PRIVACY.md](./PRIVACY.md).
- **Security Policy:** See [SECURITY.md](./SECURITY.md).

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
- **GitHub Repository & Release Guide:** [docs/PUSH_GUIDE.md](./docs/PUSH_GUIDE.md)
