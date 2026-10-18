# VeilGuard AI Desktop Sidebar Companion

A lightweight, draggable desktop sidebar that stays docked to your screen edge and automatically pops up when you switch to AI tools (such as the ChatGPT desktop app, Claude desktop, Cursor, Copilot, Perplexity, etc.).

---

## Key Features

1. **Edge-Docked & Draggable:**
   - Starts as a sleek, unobtrusive vertical handle (`🛡️ VEIL`) docked to the right edge of your screen.
   - Click the grip handle (`⋮⋮`) and drag up or down to place it anywhere along your screen edge.
   - Always-on-top so it never gets buried behind other windows.

2. **Smart AI Tool Auto-Detection:**
   - Detects the active foreground window.
   - When you switch to an AI app (ChatGPT Desktop, Claude, Cursor, Copilot, Gemini, etc.), the sidebar automatically illuminates or slides open.
   - When you switch away (to Spotify, Word, Excel, etc.), it gently collapses back so it doesn't get in your way.

3. **Clipboard Guard:**
   - When copying text to paste into an AI tool, VeilGuard silently inspects the clipboard.
   - If sensitive PII (names, emails, phone numbers, Aadhaar, PAN) or secrets (API keys, tokens) are detected, the sidebar immediately alerts you with an amber badge (`⚠️ Items detected!`).

4. **1-Click Sanitize & Copy:**
   - Previews the original text vs. sanitized text with context-aware role placeholders (`[CUSTOMER_1]`, `****-1234`).
   - Click **"Sanitize & Copy"** to automatically load the safe version into your clipboard—ready to paste (`Ctrl+V`) into the ChatGPT desktop app!

5. **Scrub PDF Documents:**
   - Click **"Scrub PDF"** to permanently redact sensitive data and wipe metadata from PDF files using VeilGuard's dual-extractor verification before sending them to AI tools.

---

## How to Run

1. **Start the local VeilGuard engine:**
   ```powershell
   .\.venv\Scripts\python -m veilguard_engine.server
   ```

2. **Launch the Desktop Sidebar:**
   - **Double-click:** `start_sidebar.bat`
   - **Or from terminal:**
     ```powershell
     .\.venv\Scripts\python desktop\sidebar_guard.py
     ```
