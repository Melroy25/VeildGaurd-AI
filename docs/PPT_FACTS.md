# VeilGuard AI: Definitive Presentation Fact Sheet

> **Single Source of Truth for Slide Deck & Demo Pitching**  
> **Team:** Team Vexora  
> **Event:** DevHack 2026  
> **Track:** Problem Statement 2.2 — Context-Aware Data Privacy under Responsible AI  
> **License & Hygiene:** All metrics below are backed by reproducible execution artifacts in `bench/results/` and passing automated test suites.

---

## 1. Executive Summary & Problem-Solution Fit

- **The Problem:** Users paste sensitive enterprise data (customer conversations, financial statements, medical records, API keys, quasi-identifiers) into public AI chat interfaces and APIs. Simple regex tools miss contextual risks and destroy benign text; off-the-shelf NER (e.g., Presidio) suffers from massive false positive rates (**84.5% FPR**), breaking user workflows.
- **The Solution:** **VeilGuard AI** is a real-time, context-aware privacy firewall that sits between the user and AI endpoints. It performs sub-40ms local loopback evaluation (`127.0.0.1:8765`), enforces deterministic policy actions (allow, redact, require approval, block), generates utility-preserving pseudonymized prompts (`[CUSTOMER_1]`, `****-1234`), requires explicit human confirmation via an isolated Shadow DOM overlay, and maintains strictly metadata-only audit logs.

---

## 2. Verified Headline Benchmark Metrics (Sealed Test Split, N=286)

All figures below are evaluated on a cryptographically sealed, frozen synthetic test corpus ($N=286$ records) under identical ground-truth assertions:

| Metric | Regex Baseline | Microsoft Presidio | VeilGuard (Type-Based) | VeilGuard AI (Full Intelligence) |
|:---|:---:|:---:|:---:|:---:|
| **Entity F1 (50% IoU)** | 56.3% | 22.6% | 43.4% | **73.2%** *(+16.9% vs Regex, +50.6% vs Presidio)* |
| **Exact Entity F1** | 51.4% | 22.3% | 41.3% | **65.3%** |
| **Flagged Precision** | 97.3% | 60.5% | 100.0% | **100.0%** *(Zero false accusations)* |
| **Flagged Recall** | 79.2% | 72.7% | 56.8% | **84.2%** |
| **False Positive Rate (FPR)** | 3.9% | 84.5% | 0.0% | **0.0%** *(0 of 103 benign prompts flagged)* |
| **Quasi-ID Combo Recall** | 17.1% | 97.1%* | 0.0% | **80.0%** *(Multi-attribute re-ID defense)* |
| **Required Retained** | 96.7% | 63.5% | 100.0% | **100.0%** *(Zero destruction of benign task context)* |

*\*Note on Presidio's 97.1% combo recall: Presidio flags 87 of 103 benign prompts indiscriminately (84.5% FPR). VeilGuard achieves 80.0% combination recall with **0.0% FPR** through deterministic policy rules (`allow_person_alone`, `allow_benign_code`), checksum verification (Verhoeff, Mod-36), and task necessity gating.*

---

## 3. Total Automated Test Coverage & Verification

Every capability in VeilGuard AI is validated by automated test suites passing with zero errors:

| Test Suite | Framework | Passing Count | Key Invariants Verified |
|:---|:---|:---:|:---|
| **Python Engine Tests** | `pytest` | **166 passed** *(3 documented xfail)* | Loopback binding, API security, token auth, Presidio recognizers, Indian IDs, task necessity, re-ID scoring |
| **Desktop Companion Tests** | `pytest` | **3 passed** | Static AST scan: zero keylogging hooks (`SetWindowsHookEx`, `pynput`, `keyboard`), active AI window detection |
| **Pure Extension Unit Tests** | `vitest` | **49 passed** | WCAG AA contrast ($\ge 4.5:1$), metadata event aggregation, zero-data leak stores, browser engine parity |
| **Browser E2E Tests** | `playwright` | **96 passed** | 14-cell full-chain enforcement matrix (**280 / 280 trials with 0 leaks**), shadow overlay XSS immunity, PDF redaction |
| **Total Automated Tests** | | **314+ verified checks** | |

---

## 4. Five Architectural Invariants (Non-Negotiable)

1. **Fail Closed (Rule 6):** If the local engine is unreachable, down, or returning errors, prompt submission is blocked immediately. Uninspected data never leaks.
2. **Loopback Binding Only (Rule 5):** The engine binds strictly to `127.0.0.1`, never `0.0.0.0`.
3. **Zero Raw Content Persistence (Rule 7):** Prompt text, medical records, and secrets are never written to disk, telemetry, or dashboard storage. Audit logs store metadata only (timestamps, rule IDs, risk scores, counts).
4. **Zero External Telemetry (Rule 8):** No network requests carrying user prompt data ever leave the local boundary.
5. **Zero Keylogging (Rule 6):** No global keyboard hooks (`SetWindowsHookEx`, `pynput`, `keyboard`). Active window detection is passive via `GetForegroundWindow`; clipboard inspection is strictly opt-in.

---

## 5. Three Complementary Delivery Formats

1. **Chrome / Chromium Browser Extension (`extension/dist`):**
   - Manifest V3 with least-privilege host permissions.
   - Isolated Shadow DOM review overlay immune to host-page CSS/XSS.
   - Dual fetch/XHR MAIN-world backstop.
   - Frosted Blue Glass metadata dashboard and interactive onboarding flow.
2. **Standalone Windows Desktop Application (`VeilGuard.exe`):**
   - Single-directory bundle (`scripts/build-windows.ps1`) ensuring LGPL/AGPL dynamic linking compliance.
   - System tray daemon (`pystray` + Pillow) with one-click sidebar toggle and dashboard launcher.
   - Edge-docked Tkinter sidebar with Win32 foreground auto-detection for desktop AI apps (ChatGPT Desktop, Claude, Cursor).
   - Inno Setup professional installer wizard (`installer/VeilGuard.iss`).
3. **Static Web Showcase Demo (`web/` on Vercel):**
   - 100% in-browser deterministic privacy rules engine (zero server dependencies).
   - Interactive prompt playground with pre-loaded presets (Healthcare, Secrets, Banking, Benign Code).
   - Copyable utility-preserving bracketed sanitized prompt output.
   - Sealed benchmark metrics explorer.

---

## 6. Site Verification Status (Rule 3 Honesty)

- **Verified ($N \ge 20$ multi-trial cell recordings):**
  - **Mock AI Chat Testbed (`127.0.0.1:4310`):** 14 cells, 280 trials passed with 0 leaks (`bench/results/enforcement_full_chain_mock_site.json`).
- **Prototype (Code exists, live multi-trial cell runs pending):**
  - **ChatGPT (`chatgpt.com`):** Unauthenticated send button and backstop tested.
  - **Google Gemini, Claude, Copilot, Perplexity, DeepSeek:** Universal rich-text adapter implemented in `universal.ts`.

---

## 7. Slide-by-Slide Talking Points (8 Slides)

- **Slide 1 (Title):** VeilGuard AI: Context-Aware Privacy Firewall for AI Tools (Team Vexora).
- **Slide 2 (The Problem):** The \$10M prompt leak — why keyword blocking fails (either leaks data or destroys 84.5% of harmless prompts).
- **Slide 3 (The Solution):** Real-time browser interception, <40ms local engine, utility-preserving pseudonymization.
- **Slide 4 (How It Works):** 5-line flow: Intercept $\to$ Analyze Locally $\to$ Decide $\to$ Pseudonymize $\to$ Enforce & Log.
- **Slide 5 (Benchmark Results):** 73.2% Entity F1, 0.0% False Positive Rate, 80.0% Combo Recall on sealed test split ($N=286$).
- **Slide 6 (Architecture & Invariants):** Fail-closed, loopback-only, zero raw content persistence, zero keylogging.
- **Slide 7 (Multi-Surface Ecosystem):** Browser Extension, Windows Standalone App (`VeilGuard.exe`), and Static Web Demo on Vercel.
- **Slide 8 (Roadmap & Conclusion):** Round-1 submission freeze (`v0.1.0-round1`) on `main`; Blue Glass release (`v0.2.0-glass`).
