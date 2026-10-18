# VeilGuard AI: Privacy Policy & Invariants

**Effective Date:** October 2026  
**Project:** VeilGuard AI (DevHack 2026, Problem Statement 2.2 — Context-Aware Data Privacy under Responsible AI)

---

## 1. Core Commitment & Privacy Invariants

VeilGuard AI is architected from the ground up as a **zero-telemetry, local-first privacy firewall**. Our foundational design invariants enforce the following guarantees:

1. **Loopback Binding Only (Rule 5):** The local Python engine binds strictly to `127.0.0.1:8765`, never to `0.0.0.0` or external network interfaces.
2. **Fail Closed (Rule 6):** If the local inspection engine is unreachable or encounters an error, submissions are blocked or held for user decision. Uninspected prompts are never allowed to silently pass.
3. **No Raw Content Persistence (Rule 7):** Raw prompts, document text, clipboard buffers, and sensitive entity values are **never** written to disk, persistent logs, telemetry, or dashboard databases.
4. **Zero External Telemetry (Rule 8):** No outbound HTTP/HTTPS requests carrying user content or prompt metadata ever leave your local machine.
5. **No Keylogging (Rule 6):** The application does not install global keyboard hooks (`pynput`, `keyboard`, `SetWindowsHookEx`, or `GetAsyncKeyState`). The desktop companion monitors only its own text input and, when explicitly enabled by the user, the clipboard buffer while an AI application is actively focused.

---

## 2. What Data Is Processed

| Data Type | Where Processed | Storage Lifetime | Persistence |
| :--- | :--- | :--- | :--- |
| **User Prompt Text** | Local engine in-memory (`127.0.0.1:8765/analyze`) | Processed during analysis request (<40ms) | **Never stored** on disk or logs. Wiped from memory after response. |
| **Document/PDF Bytes** | Local engine in-memory (`127.0.0.1:8765/pdf/redact`) | Held in RAM during redaction | **Never saved** to temp files. Underlying font glyphs purged. |
| **Clipboard Content** | Desktop sidebar RAM (opt-in only) | Inspected at time of paste | Cleared on exit, clear button, or app switch. **Never logged**. |
| **Session Pseudonyms** | Extension `chrome.storage.session` (in-memory) | Duration of browser session | Cleared upon browser restart. Never exported. |
| **Audit Log Events** | Extension `chrome.storage.local` (local only) | User-configured ring buffer (max 200 entries) | **Metadata only**: timestamp, destination, category counts, decision, rule IDs. |

---

## 3. What Is NEVER Stored

VeilGuard strictly prohibits the collection or storage of:
- Raw prompt strings or document text.
- Plaintext sensitive identifiers (names, Aadhaar numbers, PAN numbers, credit cards, bank account numbers).
- Mapping dictionaries between placeholders and real identity values.
- User credentials, browser cookies, or AI account tokens.
- Telemetry, analytics, or behavioral tracking events.

---

## 4. Metadata-Only Audit Log

The Privacy Dashboard displays strictly aggregated metadata derived from `StoredEvent` records:
- **Timestamp** of the submission attempt.
- **Destination host** (e.g. `chatgpt.com`, `gemini.google.com`).
- **Policy profile** applied (e.g. `company`, `personal`, `healthcare`).
- **Policy decision** (`allow`, `redact`, `require_approval`, `block`).
- **User choice** (`sent_sanitized`, `sent_original`, `edited`, `cancelled`, `auto_allowed`, `failed_closed`).
- **Category counts** (e.g. `PII: 1`, `GOVERNMENT_ID: 1`).
- **Rule IDs triggered** (e.g. `R_GOV_AADHAAR`, `T_COMB_01`).
- **Latency in milliseconds**.

Users can purge all audit history or export whitelisted metadata as CSV/JSON at any time from the dashboard.

---

## 5. Web Demo & Cloud Sandbox Architecture

When using the hosted web demo (e.g., on Vercel or GitHub Pages):
- **100% Client-Side:** The web playground runs a TypeScript port of deterministic checksum rules (Verhoeff Aadhaar, PAN format, GSTIN, secrets) directly inside your web browser.
- **Zero Cloud Transmission:** No text typed into the web playground is ever sent to any remote server or edge function. The page enforces a strict Content Security Policy (`connect-src 'none'`).
- **Synthetic Data Exclusively:** The public demo is designed exclusively for evaluating synthetic samples. Real personal data must never be entered into web demos.
