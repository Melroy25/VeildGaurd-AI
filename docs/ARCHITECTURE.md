# VeilGuard AI: Target Architecture

> **Notice:** This document details the intended target architecture. In Phase 0, all components described here are **design specifications only** and are **not yet implemented**.

---

## 1. High-Level Architecture Overview

VeilGuard AI operates as a split-architecture system:
1. **Client-side Extension (Chrome Manifest V3):** Responsible for deterministic interception of user input, rendering an in-DOM review modal, and managing user overrides without transmitting prompt data over the external network.
2. **Local Python Engine (FastAPI on 127.0.0.1):** Performs context-aware entity detection, task profile inference, task-necessity calculation, quasi-identifier re-identification risk scoring, policy evaluation, and utility-preserving pseudonymization.
3. **Local Placeholder Vault:** Maintains reversible pseudonym mappings within temporary session storage (`chrome.storage.session`) to allow round-trip rehydration of AI responses.

```
+-------------------------------------------------------------------------+
| Browser Environment (Chrome MV3)                                        |
|                                                                         |
|  [ AI Web Interface (ChatGPT / Claude / Mock) ]                         |
|        |                                                                |
|        | 1. Intercept Submit / Enter / Paste / Fetch                    |
|        v                                                                |
|  [ Content Script + Main World Interceptor ]                            |
|        |                                                                |
|        | 2. POST /scan (Raw Text)                                       |
|        v                                                                |
+--------|----------------------------------------------------------------+
         | (Local Loopback HTTP: 127.0.0.1:8765)
         v
+-------------------------------------------------------------------------+
| Local Python Engine (FastAPI)                                           |
|                                                                         |
|  Pipeline:                                                              |
|  1. Presidio + Custom Recognizers (Aadhaar, PAN, UPI, IFSC, Secrets)    |
|  2. Context Feature Extraction (Window, Role, Co-occurrence)            |
|  3. Task Profile Inference (Code, Writing, Analysis, Math)              |
|  4. Task-Necessity Matrix Scoring (e.g. amounts needed, names not)      |
|  5. Re-identification Risk Scoring (k-anonymity / quasi-identifiers)    |
|  6. YAML Policy Engine Evaluation (Allow, Redact, Approve, Block)       |
|  7. Utility-Preserving Sanitizer (Pseudonymize, Generalize, Suppress)   |
|        |                                                                |
|        | 3. Scan Response: { decision, entities, sanitized, diff, risk } |
|        +----------------------------------------------------------------+
         |
         v
+-------------------------------------------------------------------------+
| Browser Review & Transmission                                           |
|                                                                         |
|  [ Shadow DOM Review Overlay ]                                          |
|        |                                                                |
|        | 4. User inspects diff & risk explanations -> Approves          |
|        v                                                                |
|  [ Vault ] -> Store { "[CUSTOMER_1]": "Rahul Sharma" } in session store  |
|        |                                                                |
|        | 5. Submit sanitized text to AI Chat DOM                        |
|        v                                                                |
|  [ AI Web Interface ] -> [ External LLM API ]                           |
+-------------------------------------------------------------------------+
```

---

## 2. Browser Extension Components (MV3, TypeScript)

- **Adapter Layer (`src/content/adapters/`):** Declarative site configurations containing target input selectors, submit button selectors, file upload drop zones, and DOM mutation observers for single-page applications.
- **Submission Interceptor (`src/content/`):** Multi-layered event listener capturing:
  - Form submit events
  - Keyboard `Enter` (and `Cmd+Enter` / `Ctrl+Enter`)
  - Direct button click events
  - Clipboard paste events containing sensitive structures
- **MAIN-World Fetch Backstop (`src/page-world/`):** Script injected into the page execution context to monkey-patch `window.fetch` and `XMLHttpRequest`, guaranteeing that even programmatic or synthetic submissions cannot bypass DOM listeners.
- **Review Overlay (`src/content/overlay/`):** Isolated within a closed Shadow DOM to avoid host-page CSS pollution or interference. Displays detected entity tags, necessity badges, risk explanations, and a visual side-by-side diff.
- **Service Worker (`src/background/`):** Handles extension lifecycle, tab coordination, and local engine health monitoring. MV3 service workers are ephemeral and will not store state in global memory.
- **Popup & Options Dashboard (`src/popup/`, `src/options/`):** React-based interfaces. The options page serves as a local dashboard displaying strictly metadata-only audit records (categories, timestamp, risk score, decision; never raw prompt text).

---

## 3. Local Python Engine Components (`engine/veilguard_engine/`)

- **Server (`server.py`):** FastAPI application bound strictly to `127.0.0.1:8765`.
- **Detectors (`detectors/`):**
  - Microsoft Presidio Analyzer engine backed by spaCy (`en_core_web_sm`).
  - Custom recognizers with deterministic checksum validators (Aadhaar with Verhoeff algorithm, PAN, UPI ID, IFSC code, GSTIN).
  - High-entropy secrets and API key pattern detectors.
  - User-configurable watchlist matcher.
- **Context Extractor (`context/`):** Analyzes positional context, semantic role, surrounding window tokens, and co-occurring entity types.
- **Necessity Matrix (`necessity/`):** Maps inferred task intents (e.g., financial debugging vs. creative writing) against entity requirements. Suppresses unnecessary entities while preserving operational fields (e.g., maintaining transaction amounts while masking account holders).
- **Re-identification Scorer (`reid/`):** Evaluates risk combinations of quasi-identifiers (e.g., zip code + gender + age) that could re-identify individuals even without direct names.
- **Policy Engine (`policy/`):** Evaluates YAML configuration rules (`policies/default.yml`) against scan context to return a deterministic decision: `ALLOW`, `REDACT`, `REQUIRE_APPROVAL`, or `BLOCK`.
- **Sanitizer (`sanitizer/`):** Generates consistent surrogate tokens (e.g., `[CUSTOMER_1]`, `[DATE_A]`) and calculates a structured token diff. Flags whether transformations may degrade task utility.
- **PDF Engine (`pdf/`):** PyMuPDF (`fitz`) engine executing redaction annotations, coordinate-level blackouts, text suppression, and post-redaction re-extraction verification.
