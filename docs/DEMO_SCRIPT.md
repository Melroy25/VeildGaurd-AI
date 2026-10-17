# VeilGuard AI: 4-Minute Live Demonstration Script

**Event:** DevHack 2026 — PS 2.2 Context-Aware Data Privacy under Responsible AI  
**Presenter:** Team Vexora  
**Total Target Time:** 3 minutes 45 seconds (≤ 4 minutes limit)  
**Environment:** Local Engine (`127.0.0.1:8765`), Mock AI Chat Testbed (`127.0.0.1:4310`), Chrome MV3 Extension (`extension/dist`).

---

## Technical Rehearsal Checklist (Pre-Demo)

- [ ] Local engine running on loopback: `python -m veilguard_engine.server`
- [ ] Health check returns OK: `curl http://127.0.0.1:8765/health`
- [ ] Mock AI site running: `npm run mock-site` (`http://127.0.0.1:4310`)
- [ ] Extension loaded unpacked from `extension/dist/` with valid token
- [ ] Browser tabs prepared:
  - Tab 1: Mock AI Site (`http://127.0.0.1:4310`)
  - Tab 2: VeilGuard Privacy Dashboard (`chrome-extension://<id>/options.html`)

---

## Demo Timeline & Spoken Script

### Act 1: The Problem & Everyday Exposure (0:00 – 0:45)

**On Screen:** Tab 1: Mock AI Site (`http://127.0.0.1:4310`), empty chat composer.

> **Spoken:**  
> "Every single day, employees, developers, and support teams paste real customer records, financial accounts, and proprietary snippets into AI chat windows.  
> Traditional DLP tools rely on blunt regex patterns that either miss subtle context or over-redact harmless text, breaking the AI's ability to help.  
> Today, we present **VeilGuard AI** — a context-aware privacy firewall that intercepts submissions in real time, evaluates contextual risk, generates utility-preserving pseudonymized prompts, and ensures zero raw sensitive data leaves the device."

**Action:** Paste sample customer analysis prompt into `#chat-composer-textarea`:
```text
Analyze customer Rahul Sharma's account. His phone number is 9876543210 and Aadhaar number is 2345 6789 0123. Please check his recent transaction TXN-9012 for billing discrepancies.
```
**Screenshot:** `docs/screenshots/demo-02-prompt-entered.png`

---

### Act 2: Interception & Context Intelligence (0:45 – 1:50)

**Action:** Click the "Send" button (or press Enter).  
**On Screen:** Submission is intercepted instantly. The **VeilGuard Review Overlay** emerges via closed Shadow DOM.

> **Spoken:**  
> "Notice what just happened. The message did *not* reach the AI provider.  
> In less than 40 milliseconds on local loopback, VeilGuard's multi-signal engine detected the customer name, phone number, and Verhoeff-verified Aadhaar ID.  
> Furthermore, our context engine inferred the user's intent — billing analysis — and determined that while the transaction reference TXN-9012 is necessary for the task, the customer's personal identifiers are completely non-essential.  
> VeilGuard generated a utility-preserving prompt with deterministic role placeholders: `[CUSTOMER_1]`, masked phone `[PHONE_1]`, and masked Aadhaar `[AADHAAR_1]`."

**Action:** Point cursor to the side-by-side diff view and the plain-language explanation tags in the overlay.
**Screenshot:** `docs/screenshots/demo-03-review-overlay.png`

---

### Act 3: Enforcing Actions & AI Utility Preservation (1:50 – 2:45)

**Action:** Click the primary action button: **"Send Sanitized"**.  
**On Screen:** Overlay dismisses. The chat displays the sanitized prompt. The simulated AI model streams back a helpful billing response addressed to `[CUSTOMER_1]`.

> **Spoken:**  
> "By clicking 'Send Sanitized', the prompt delivered to the AI endpoint contained zero raw personal data.  
> But observe: the AI answers the prompt accurately because the semantic structure and transaction identifier were preserved.  
> If the user continues the conversation in turn two and mentions 'Rahul' again, VeilGuard's session vault maintains cross-turn consistency, re-mapping him to `[CUSTOMER_1]` automatically."

**Screenshot:** `docs/screenshots/demo-04-sanitized-sent.png`

---

### Act 4: Severe Secret Blocking & Zero Raw Telemetry (2:45 – 3:30)

**Action:** In the composer, paste a live system credential:
```text
Debug connection: DATABASE_URL=postgres://app_user:s3cr3tP@ssw0rd!@db.internal:5432/prod_db
```
Click **"Send"**.

**On Screen:** Red **Block Overlay** appears with danger icon: *"Submission Blocked — Critical Secret Detected"*. The "Send Original" option is completely absent.

> **Spoken:**  
> "Under company policy, database credentials and API secrets trigger an unconditional **BLOCK**.  
> The user cannot override this action; zero bytes leave the browser.  
> Now let's look at the privacy audit trail."

**Action:** Switch to Tab 2: VeilGuard Privacy Dashboard.
**On Screen:** Real-time event log, decision breakdown, and category counts update.
**Screenshot:** `docs/screenshots/demo-06-privacy-dashboard.png`

> **Spoken:**  
> "In accordance with our strict privacy invariants, VeilGuard stores **metadata only**: entity types, rule IDs, risk score, and timestamp.  
> Zero prompt text, zero customer names, and zero credentials ever touch disk, storage, or external networks."

---

### Act 5: Scientific Honesty & Conclusion (3:30 – 3:45)

> **Spoken:**  
> "In reproducible sealed-test benchmarks across 286 items, VeilGuard achieved **73.2% entity F1** and **80.0% quasi-identifier combination recall**, while preserving **100.0% required task tokens** with **0.0% false positives** on benign text.  
> We don't claim impossible 100% protection — our open limitations are documented in `LIMITATIONS.md`.  
> VeilGuard AI gives organizations real, verifiable, context-aware protection without destroying AI utility. Thank you!"

---

## Contingency & Fallback Matrix

| Issue | Probability | Quick Recovery / Spoken Fallback |
|---|---|---|
| Engine loopback port blocked | Low | Engine automatically falls closed with an amber warning badge. Explain: *"VeilGuard's fail-closed design prevents uninspected data from ever leaking if the engine is unreachable."* |
| Mock AI site takes >1s to stream | Very Low | Point to network inspector: show captured request headers and payload proving sanitized body was sent. |
| Browser zoom misaligns overlay | Low | Press `Ctrl+0` to reset zoom to 100%. |
