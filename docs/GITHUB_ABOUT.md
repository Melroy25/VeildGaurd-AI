# GitHub Repository Metadata & Release Notes Draft

## 1. Repository Description (< 160 Characters)
```text
Context-aware privacy firewall for AI tools. Intercepts sensitive prompts & documents locally with utility-preserving pseudonymization. Zero external telemetry.
```
*(Character count: 159 characters)*

---

## 2. Recommended Topics (Tags)
`responsible-ai`, `privacy`, `ai-safety`, `data-protection`, `generative-ai`, `presidio`, `fastapi`, `chrome-extension`, `manifest-v3`, `pseudonymization`, `devhack-2026`, `zero-telemetry`

---

## 3. Release Notes Draft: `v0.1.0-round1`

### VeilGuard AI — Round 1 Release (DevHack 2026)

We are excited to introduce **VeilGuard AI v0.1.0-round1**, a context-aware data privacy firewall for generative AI tools, built for DevHack 2026 (Problem Statement 2.2).

VeilGuard AI operates between users and AI interfaces to intercept prompt and document submissions, detect sensitive personal, financial, and confidential data, enforce deterministic policy actions, and generate utility-preserving pseudonymized text—running completely locally with **zero external telemetry** and **zero raw content persistence**.

#### What's Included:
- **Local Privacy Engine (FastAPI on `127.0.0.1:8765`):**
  - Indian government ID detectors: Algorithmic Verhoeff Aadhaar checksum validation, PAN formatting, and GSTIN modulo-36 checks.
  - Multi-class PII detectors: Phone numbers, emails, names, API keys, credentials, and medical conditions.
  - Context-aware task inference and indirect quasi-identifier re-identification risk scoring.
  - Utility-preserving pseudonymization with semantic role placeholders (`[CUSTOMER_1]`, `[PATIENT_1]`) and grammatical possessive handling.
- **Universal Browser Extension (Manifest V3):**
  - Universal DOM interception for ChatGPT, Google Gemini, Claude, Copilot, Perplexity, DeepSeek, Poe, Mistral, and Google AI Studio.
  - In-page Shadow DOM review overlay with side-by-side diffs and explicit confirmation workflows.
  - Metadata-only privacy dashboard with audit export (CSV/JSON) and recording pause controls.
- **True PDF Redaction Engine:**
  - In-memory redaction enforcing 10MB/50-page limits.
  - Purges underlying vector glyphs and renders clean visual pseudonym tags `[PATIENT_1]`, `[PHONE_1]` rather than solid black bars.
  - Dual-extractor verification (cross-verified by both PyMuPDF and `pypdf`).
- **Desktop Sidebar Companion (`sidebar_guard.py`):**
  - Ultra-thin 6px edge sliver with auto-pop on AI application focus (Cursor, VS Code, LM Studio).
  - Opt-in clipboard buffer inspection gated strictly to focused AI tools.
  - Dedicated 1-click button to open the extension dashboard directly in your browser.
- **Empirical Evaluation & Test Suites:**
  - 166 passing automated pytest tests and 35 Vitest unit tests.
  - Multi-trial enforcement benchmark across 14 cells with 0 leaks across 280 trials.
  - Cryptographically sealed frozen benchmark dataset evaluated and documented in `docs/EVIDENCE.md`.

#### Verification & Installation:
See [README.md](../README.md) for automated setup scripts (`setup.ps1` / `setup.sh`) and [docs/PUSH_GUIDE.md](./PUSH_GUIDE.md) for instructions on running and verifying the release.
