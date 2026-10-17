# VeilGuard AI: Presentation Slide Deck Content (8 Slides)

**Event:** DevHack 2026  
**Problem Statement:** PS 2.2 — Context-Aware Data Privacy under Responsible AI  
**Team:** Team Vexora  
*(All metrics are sourced directly from reproducible execution artifact `bench/results/benchmark_test.json`. Zero numbers are fabricated.)*

---

## Slide 1: Title & Overview

- **Title:** VeilGuard AI
- **Subtitle:** Context-Aware Privacy Firewall for Generative AI Interfaces
- **Track / Problem Statement:** PS 2.2 — Context-Aware Data Privacy under Responsible AI
- **Team Name:** Team Vexora
- **Team Members:**
  - `[HUMAN FILL: Member 1 Name — Role]`
  - `[HUMAN FILL: Member 2 Name — Role]`
  - `[HUMAN FILL: Member 3 Name — Role]`
  - `[HUMAN FILL: Member 4 Name — Role]`
- **Repository URL:** `[HUMAN FILL: Public GitHub URL]`
- **Live Demonstration Video:** `[HUMAN FILL: 4-Minute Video Link]`
- **One-Line Thesis:** A local, context-aware firewall that intercepts AI prompts before transmission, replaces sensitive quasi-identifiers with utility-preserving pseudonyms, and records strictly metadata-only audit logs.

---

## Slide 2: The Problem: The Unchecked AI Data Leak

- **The Real-World Threat:**
  - 100M+ enterprise users paste customer records, medical notes, Aadhaar/SSN IDs, and proprietary secrets into public AI chats daily.
  - Generative AI providers ingest prompts into training pipelines, retention logs, and multi-tenant memory.
- **Why Existing DLP & Redaction Tools Fail:**
  1. **Blunt Regex & Keywords:** High false-positive rates (**84.5% FPR** for stock Presidio on benign code/instructions), destroying prompt syntax and rendering the AI useless.
  2. **Quasi-Identifier Blindness:** Individually benign attributes (job title, age group, department, city) combine to uniquely re-identify individuals. Regex cannot detect indirect combination risk (**17.1% combo recall**).
  3. **Non-Reversible Anonymization:** Redacting names to `[REDACTED]` destroys multi-turn conversational coherence.
  4. **Cloud-Dependent Scanning:** Sending raw prompts to an external cloud DLP service duplicates the exact privacy breach it attempts to prevent.

---

## Slide 3: The Solution: VeilGuard AI Architecture

- **How It Works (The 5-Stage Local Pipeline):**
  1. **Capture-Phase DOM Interception:** Zero-latency interception inside the browser (MV3 extension) before network submission.
  2. **Local Loopback Engine (127.0.0.1:8765):** Multi-signal detection combining Presidio NLP, custom Indian ID checksums (Verhoeff), secrets regex, and quasi-attribute extractors.
  3. **Context & Intent Intelligence:** Classifies task necessity (e.g., KYC verification vs. code debugging vs. text summarization) to preserve essential task data while scrubbing superfluous PII.
  4. **Deterministic Policy Enforcement:** Evaluates company policy rules to determine: `allow`, `redact`, `require_approval`, or `block`.
  5. **Utility-Preserving Sanitization:** Emits role-based semantic placeholders (`[CUSTOMER_1]`, masked card `****-1234`) with memory session-vault consistency.
- **Fail-Closed Security Backstop:** A MAIN-world fetch/XHR bridge blocks raw network traffic if an attacker attempts programmatic script evasion or if the engine goes offline.

---

## Slide 4: Key Technical Innovations

1. **Deterministic Core (No Non-Deterministic LLM Dependency):**
   - Privacy enforcement must never depend on an external or non-deterministic LLM. All scanning, necessity rules, and policies execute deterministically in **<40ms (median latency)**.
2. **Context-Aware Necessity Matrix:**
   - Evaluates whether an entity is required for the user's specific prompt intent. Preserves 100% of required technical tokens while eliminating privacy hazards.
3. **Quasi-Identifier Combination Risk Scorer:**
   - Computes statistical re-identification risk across multi-attribute combinations (age + gender + zip code + role) using noisy-OR aggregation.
4. **Dual-Layer Browser Defense:**
   - Combines isolated-world DOM capture with main-world native fetch interception to eliminate extension bypass vulnerabilities.
5. **Strict Privacy Invariants (Rule 7):**
   - Zero raw text, zero prompt tokens, and zero entity values are ever written to disk, telemetry, or dashboard storage. Metadata-only audit logs.

---

## Slide 5: Live Demonstration & User Experience

- **User Journey in Action:**
  - *Step 1: Paste:* User pastes a complex customer billing query containing customer name, phone, transaction ID, and Aadhaar number.
  - *Step 2: Intercept & Explain:* VeilGuard Review Overlay emerges. Explains task inference (*Billing Analysis*), displays detected entities with confidence scores, and visualizes an interactive diff.
  - *Step 3: Sanitized Delivery:* User clicks "Send Sanitized". AI receives utility-preserving prompt addressed to `[CUSTOMER_1]`. AI answers billing questions accurately.
  - *Step 4: Hard Secret Block:* User attempts to paste an internal database connection URL. VeilGuard triggers a hard **Block Modal** with zero user override possible.
  - *Step 5: Metadata Dashboard:* Options page visualizes decision distributions, rule frequencies, and daily trends without storing a single prompt byte.
- *(Visuals: See high-res rehearsal screenshots in `docs/screenshots/demo-*.png`)*

---

## Slide 6: Empirical Results & Sealed-Test Benchmark

*Sealed Test Split: N=286 items | Cryptographic SHA-256: `335a7ad7...` | Run #1 recorded at commit `41b9fc1`.*

| Metric / Dimension | Regex Baseline | Microsoft Presidio | VeilGuard AI (Ours) | Advantage |
|---|---|---|---|---|
| **Entity F1 (50% IoU)** | 56.3% | 22.6% | **73.2%** | **+50.6% over Presidio** |
| **Exact Boundary Entity F1** | 51.4% | 22.3% | **65.3%** | **+43.0% over Presidio** |
| **Quasi-ID Combination Recall** | 17.1% | 97.1% *(with 84.5% FPR)* | **80.0%** | **4.7x over Regex** |
| **False Positive Rate (Benign Prompts)**| 3.9% | 84.5% *(destroys code)* | **0.0%** | **Zero Benign Destruction** |
| **Required Token Retention** | 96.7% | 63.5% | **100.0%** | **Full AI Utility Preserved** |
| **End-to-End Leakage Trials** | N/A | N/A | **0 / 280 Leaks (14/14 Pass)**| **100% Verified Enforcement** |

---

## Slide 7: Scientific Honesty & Known Boundaries

> **Rule 1 & Rule 3 Compliance:** We openly declare the technical boundaries of our system rather than claiming complete protection.

- **What VeilGuard AI Solves:**
  - Inadvertent pasting of direct PII (names, emails, phones, Aadhaar, PAN, GSTIN), API secrets, medical conditions, and high-risk quasi-identifier combinations.
  - Cross-turn pseudonym consistency and zero-raw-content audit logging.
- **Documented Limitations (from `docs/LIMITATIONS.md`):**
  1. **Statistical NER Sensitivity:** Compact offline models (`en_core_web_sm`) can miss lowercased names or transliterated non-English regional names lacking contextual cues.
  2. **Isolated Numeric Ambiguity:** A bare 10-digit number without semantic context cannot be definitively separated from an internal tracking ID.
  3. **Scanned Raster PDFs:** Text extraction requires vector or embedded text streams; image-only scanned PDFs require an upstream OCR pipeline.
  4. **Insider Malice:** Designed to protect against unintentional data spills. An employee with dev tools or system access can intentionally bypass client software.

---

## Slide 8: Summary, Roadmap & Conclusion

- **Submission Readiness:**
  - Automated one-command setup scripts (`scripts/setup.ps1`, `scripts/setup.sh`) verified in clean temporary environments.
  - Comprehensive automated test suite: **155 unit/integration tests passing**, **28 extension unit tests**, **25 E2E browser scenarios**, and **14/14 full-chain matrix cells**.
  - 100% reproducible benchmark suite with immutable SHA-256 hash sealing.
- **Future Roadmap (Post-Hackathon):**
  - Offline local ONNX small-language-model assistance for enhanced regional NER.
  - Native enterprise adapters for Claude, Gemini, and Microsoft Copilot.
  - On-device local OCR engine for scanned PDF document redaction.
- **Closing Statement:**
  - VeilGuard AI proves that data privacy and generative AI utility are not mutually exclusive. With context intelligence and deterministic guardrails, organizations can safely empower employees with AI.
- **Q&A:**
  - Thank you! Questions & Live Inspection Welcome.
