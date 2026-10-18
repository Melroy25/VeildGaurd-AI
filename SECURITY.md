# VeilGuard AI: Security Policy & Threat Model

## 1. Reporting Security Vulnerabilities

We take the security of VeilGuard AI seriously. If you discover a vulnerability or potential privacy leakage issue, please report it responsibly:

- **Email:** `[HUMAN FILL: Security Contact Email]`
- **Response Timeline:** We acknowledge receipt within 48 hours and provide a resolution or mitigation plan within 7 calendar days.
- **Responsible Disclosure:** Please do not publicly disclose the vulnerability until the team has reviewed and addressed the issue.

---

## 2. Threat Model & Boundaries

VeilGuard AI is designed as a client-side defensive firewall between human users and public AI chat endpoints. The security architecture addresses specific threat vectors while declaring explicit boundaries:

### A. In-Scope Defenses
- **Accidental PII / Credential Leakage:** Prevents unintentional paste and submission of personal identifiers (Aadhaar, PAN, phone numbers), financial account numbers, API keys, private keys, and medical details into AI chat composers.
- **Indirect Re-identification:** Identifies combinations of quasi-identifiers (e.g. role + department + city) that collectively compromise anonymity.
- **Fail-Closed Protection:** Blocks submission when the local engine is offline, authentication fails, or an unexpected error occurs.
- **Shadow DOM Isolation:** Renders review overlays inside closed/isolated Shadow DOM to prevent host page scripts from tampering with or observing user review actions.
- **IsTrusted Event Validation:** Blocks synthetic programmatic click events from host scripts attempting to click "Send Original" or bypass review dialogs.

### B. Out-of-Scope & Known Boundaries
- **Hostile Browser Extensions:** If a user installs malicious extensions with broad host permissions or native messaging privileges, those extensions can inspect the DOM or clipboard outside VeilGuard's boundary.
- **Compromised Host Operating System (Local Malware):** A compromised operating system running keyloggers, screen scrapers, or memory dumpers cannot be mitigated by userland extensions or background companions.
- **Hostile AI Page Architecture:** If an AI host site employs novel exfiltration channels (e.g., custom WebSockets, WebRTC data channels, or background service workers bypassing standard `fetch`/`XMLHttpRequest`), VeilGuard's browser-level monkey-patching may not intercept those unmodeled vectors.
- **Bearer Token in Local Storage:** The bearer token authenticating the extension to the local engine is stored in `chrome.storage.local`. Other extensions cannot read this storage, but access to the raw disk file on an unencrypted machine could expose the token.

---

## 3. Engineering Security Controls

- **Origin Validation:** The local engine strictly checks HTTP `Origin` headers on every request to ensure calls originate exclusively from the authorized Chrome extension ID or trusted local mock testbed.
- **Bearer Token Authentication:** Every API request requires a high-entropy Bearer token stored in `.veilguard/token` with restrictive per-user filesystem permissions.
- **Input Sanitization & Limits:** Endpoints enforce strict payload boundaries (maximum 50,000 characters for prompts; 10 MB and 50 pages for PDF documents) to prevent denial-of-service through resource exhaustion.
- **Dual-Extractor PDF Verification:** Redacted PDFs are cross-verified by two independent parsers (PyMuPDF and `pypdf`) before delivery to verify zero residual sensitive glyphs or text stream remnants.
