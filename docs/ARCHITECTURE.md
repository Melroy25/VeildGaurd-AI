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
|  2. Overlap Resolution (Deterministic 5-tier priority hierarchy)        |
|  3. YAML Policy Engine Evaluation (Allow, Redact, Approve, Block)       |
|  4. Utility-Preserving Sanitizer (Consistent placeholders, Mask, Remove)|
|  5. Post-Sanitization Re-Scan Verification (Proof of 0 residual PII)    |
|  [Future Phase 5]: Context Extraction, Task Profiling, Necessity Matrix |
|        |                                                                |
|        | 3. Response: { decision, options, findings, sanitization, ... } |
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

---

## 4. Phase 3c: Event Flow, Trust Boundaries, and Dashboard Architecture

### Event Flow Pipeline

```
[ User Input / Send Action ]
             │
             ▼
[ Content Script Interception (flow.ts) ]
             │  (Engine /analyze evaluation)
             ▼
[ User Choice on Review Overlay ]
 (sent_sanitized, sent_original, edited, cancelled, auto_allowed, failed_closed)
             │
             │ chrome.runtime.sendMessage({ type: "RECORD_EVENT", event: metadataOnlyEvent })
             ▼
[ Background Service Worker (index.ts -> events-store.ts) ]
             │
             ├─ 1. Pause Switch Check: If `vgRecordHistory === false`, drop event immediately.
             │     (Note: Pausing history NEVER disables interception or protection).
             │
             ├─ 2. Runtime Whitelist (`sanitizeEvent`):
             │     Drops all free-text fields. Verifies enumerated values, regex patterns,
             │     and numeric bounds. Drops rogue fields and extra keys.
             │
             ├─ 3. Serialized Write Queue:
             │     Routes writes through a Promise chain to eliminate concurrency races.
             │
             ├─ 4. Ring Buffer (1000-event cap):
             │     Retains only the newest 1000 events in `chrome.storage.local["vg_events"]`.
             ▼
[ chrome.storage.local ("vg_events") ]
             │
             ├──────────────────────────────────────┐
             ▼                                      ▼
[ Options Page: Dashboard (Options.tsx) ]   [ Action Popup (Popup.tsx) ]
  - Reads `vg_events`                         - Reads `vg_events` (today's counts)
  - Pure aggregation via `summarize()`        - Pings engine `/health` (connected/unreachable)
  - SVG/CSS charts (no external libraries)    - Queries active tab content script
  - Time range & facet filtering                via `chrome.tabs.sendMessage` (GET_STATUS)
  - Whitelist-only CSV/JSON export              WITHOUT `tabs` permission
  - Two-click history purge                   - Shows active profile
```

### Trust Boundaries & Privacy Invariants

1. **Dashboard Boundary:**
   - **What it CAN see:** Metadata fields only (`timestamp`, `destination`, `profile`, `decision`, `user_choice`, `rule_ids`, `category_counts`, `entity_count`, `latency_ms`, `source`, `outcome`).
   - **What it CANNOT see:** Raw prompt text, input strings, matched entity substrings, placeholder mappings, user identity, or engine bearer token.
   - **Zero External Egress:** Dashboard and popup make zero external network requests. All data is stored and rendered locally within the browser origin.

2. **Popup Boundary:**
   - Works entirely without the privileged `tabs` permission in `manifest.json`.
   - Engine status is determined via local loopback `/health` ping.
   - Page status displays `Protected` only if a verified VeilGuard content script responds on the inspected tab; otherwise clearly marks `Not active on this site (unsupported site)`. Never implies protection where none exists.

