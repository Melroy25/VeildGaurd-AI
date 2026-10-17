# VeilGuard AI: ChatGPT (https://chatgpt.com) Site Survey & Feasibility Record

**Date of Verification:** 2026-10-17  
**Target AI Site:** ChatGPT (`https://chatgpt.com`)  
**Phase:** Phase 4 (Part A: Survey and Decision Record)  
**Inspector:** VeilGuard AI Pair-Programming Agent & Engineering Team  
**Governing Rules:** Rules 1–27 of `AGENTS.md` (specifically Rules 22–27 for live-site testing)

---

## 1. Executive Summary & Feasibility Verdict

### Feasibility Verdict: **PROCEED (with network-boundary interception and manual profile initialization)**

- **Automation Feasibility:** Automated HTTP calls to `chatgpt.com` encounter Cloudflare bot protection (`Cf-Mitigated: challenge`, `HTTP 403 Forbidden`). However, VeilGuard AI is an in-browser client-side extension that intercepts user submissions *before* they leave the browser.
- **Testing Safety:** In compliance with Rule 22, all automated Playwright test trials in Phase 4 use Playwright `page.route` to intercept `/backend-api/conversation` requests at the browser network boundary, recording the payload and returning a local stub response. **Zero test prompts or network requests reach OpenAI's servers.**
- **Authentication & Profile:** In compliance with Rule 24, all credentials belong strictly to the human. A dedicated local Playwright browser profile (`.playwright-real-profile/`, gitignored) is used for manual login via `npm run e2e:real:login`.

---

## 2. Authentication States & Supported Scope

ChatGPT provides two operational modes:

| Mode | Entry URL | Chat Request Endpoint | Session Mechanism | In Scope for Phase 4? |
| :--- | :--- | :--- | :--- | :--- |
| **Logged-Out (Anonymous)** | `https://chatgpt.com/` | `/backend-anon/conversation` or `/backend-api/conversation` | Anonymous session cookies, IP rate-limits | Supported & Testable |
| **Logged-In (Authenticated)** | `https://chatgpt.com/` | `https://chatgpt.com/backend-api/conversation` | `__Secure-next-auth.session-token`, bearer tokens | Supported & Testable |

**Scope Decision:**  
The adapter supports both endpoint patterns:
- `/backend-api/conversation`
- `/backend-anon/conversation`

Only the active DOM and request formats verified in this survey are supported. Per Rule 3 (Honesty), this survey certifies protection against the DOM observed on 2026-10-17.

---

## 3. DOM Analysis & Selectors

### 3.1 Main Composer (Text Input)
- **Editor Technology:** ProseMirror rich-text editor wrapped in a custom React component.
- **Primary Element:** `div#prompt-textarea` with attribute `contenteditable="true"`, `role="textbox"`.
- **Selector Priority:**
  1. `#prompt-textarea` (Stable ID attribute)
  2. `[data-testid="prompt-textarea"]` (Test ID fallback)
  3. `div.ProseMirror[contenteditable="true"]` (ProseMirror structural class)
  4. `textarea#prompt-textarea` (Legacy textarea fallback for simplified views)

#### Text Reading (`getText()`)
The ProseMirror editor stores paragraph blocks inside `<p>` child elements.
- Reading via `innerText` preserves natural line breaks.
- Normalization: VeilGuard applies `normalizeForCompare(text)` which trims leading/trailing whitespace, converts `\r\n` to `\n`, and normalizes consecutive blank lines.

#### Text Writing (`setText(text)`)
Setting `.value` or `.textContent` directly breaks React/ProseMirror internal state. The reliable cross-browser approach for ProseMirror:
1. Focus the editor element (`element.focus()`).
2. Select all existing contents:
   ```typescript
   const selection = window.getSelection();
   const range = document.createRange();
   range.selectNodeContents(element);
   selection?.removeAllRanges();
   selection?.addRange(range);
   ```
3. Insert replacement text via `document.execCommand("insertText", false, text)` or dispatching an `InputEvent` (`inputType: "insertText"`).
4. Dispatch synthetic `input` and `change` events with `bubbles: true`.
5. Post-condition check: verify `normalizeForCompare(getText()) === normalizeForCompare(text)`. If desynchronized, fail closed.

### 3.2 Main Send Button
- **Primary Element:** Dedicated submit button inside the prompt bar.
- **Selector Priority:**
  1. `button[data-testid="send-button"]` (Standard production test ID)
  2. `#composer-submit-button` (Structural ID fallback)
  3. `button[aria-label="Send prompt"]` (ARIA accessibility fallback)
  4. `button[aria-label="Send message"]` (Alternative ARIA label)

### 3.3 Keyboard Submission Paths
- **Enter Key:** Pressing `Enter` without modifiers triggers message submission.
- **Shift+Enter:** Inserts a newline (`<br>` or new `<p>`) and does NOT trigger submission.
- **IME Composition:** When typing via Input Method Editors (CJK, etc.), `e.isComposing` or `e.keyCode === 229` fires; VeilGuard explicitly ignores these events.

### 3.4 Secondary Composers (Message Editing)
- **Behavior:** Hovering over an existing user message in chat history exposes an "Edit" button. Clicking it replaces the user message display with an inline editor.
- **Structure:**
  - Container: `[data-message-author-role="user"]` or `.group/conversation-turn`
  - Inline Composer: `div.ProseMirror[contenteditable="true"]` or `textarea`
  - Inline Action Buttons:
    - Send / Save: `button.btn-primary` or `button[data-testid="edit-submit-button"]`
    - Cancel: `button.btn-secondary` or `button:has-text("Cancel")`
- **Context Resolution:** The adapter's `resolveContext(event)` uses `event.target.closest(...)` to identify whether the trigger originates from an edit block or the main composer.

---

## 4. Other User Submission Entry Points

| Entry Point | DOM Indicator | Risk Type | VeilGuard Phase 4 Handling |
| :--- | :--- | :--- | :--- |
| **File Attachments / Uploads** | `button[data-testid="composer-plus-btn"]`, `input[type="file"]` | File/PDF data leakage | **Non-blocking Notice:** Displays "Attachments are not scanned by VeilGuard yet. Their contents are not checked." (Phase 7 scope) |
| **Drag & Drop Files** | Drop target over `#prompt-textarea` or main container | Document drop | Intercept `dragover`/`drop` to show attachment notice |
| **Voice / Dictation Mode** | `button[data-testid="voice-mode-button"]` | Real-time audio streaming | **Documented Limitation:** Audio streams bypass text DOM interception |
| **Prompt Suggestions / Starters** | `button[data-testid="suggestion-button"]`, starter cards | Pre-built benign text | Injected text enters composer and is evaluated upon submission |
| **Regenerate / Continue** | `button[data-testid="regenerate-button"]` | Re-runs prior prompt | Prior prompt was already inspected; benign payload |

---

## 5. Network Request Format & Extraction

### 5.1 Outgoing Endpoint (Verified 2026-10-17)

ChatGPT operates two distinct endpoint architectures depending on authentication state:

| Auth State | Preparation Endpoint | Submission Endpoint |
| :--- | :--- | :--- |
| **Logged-Out (Unauthenticated)** | `POST /unauth-mweb/conversation/prepare?lightweight_authenticated=0` → `{ ok: true }` | `POST /unauth-mweb/conversation/updates?lightweight_authenticated=0&operationId=...` |
| **Logged-In (Authenticated)** | N/A (no prepare step) | `POST /backend-api/conversation` |
| **Anon (Legacy)** | N/A | `POST /backend-anon/conversation` |

> **Route-Stub Coverage (Rule 22):** The Playwright `page.route` pattern `/(backend-api|backend-anon|unauth-mweb)\/conversation/` intercepts all three variants. The prepare endpoint (`/prepare`) receives `{ ok: true }` stubs; the submission endpoint (`/updates` or `/conversation`) receives minimal SSE stubs. Zero bytes reach OpenAI.

- **Method:** `POST`
- **Content-Type:** `application/json`

### 5.2 Payload Shape
```json
{
  "action": "next",
  "messages": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "author": { "role": "user" },
      "content": {
        "content_type": "text",
        "parts": [
          "User prompt text here"
        ]
      },
      "metadata": {}
    }
  ],
  "parent_message_id": "123e4567-e89b-12d3-a456-426614174000",
  "model": "auto",
  "conversation_id": null,
  "timezone_offset_min": -330
}
```

### 5.3 Request Body Extraction (`extractUserText`)
1. **JSON String Bodies:** Parse stringified JSON; traverse `parsed.messages[0].content.parts` and concatenate string entries.
2. **`Request` Object:** Read via `request.clone().text()`, then parse as JSON.
3. **`Blob` / `ArrayBuffer`:** Read via `FileReader` or `TextDecoder`, then parse as JSON.
4. **Readable Streams:** If `body instanceof ReadableStream` or body is locked/streaming, the text cannot be inspected ahead of dispatch.
   - **Fail-Closed Invariant (Rule 6):** Fail closed. Throw `TypeError("Failed to fetch: request blocked by VeilGuard AI backstop (unreadable streaming body).")`.

### 5.4 Live Selector Verification (Verified 2026-10-17)

| Element | Selector | Notes |
| :--- | :--- | :--- |
| Composer (textarea) | `#mobile-composer-prompt` | `TEXTAREA`, placeholder `"Ask ChatGPT"`, `aria-label="Chat with ChatGPT"` |
| Send Button | `button[aria-label="Send message"]` | `type="submit"` |

The ChatGPT adapter also probes fallback selectors:
- Composer: `#prompt-textarea`, `textarea[placeholder='Ask ChatGPT']`, `div.ProseMirror[contenteditable='true']`
- Send: `button[data-testid="send-button"]`, `button[aria-label="Send prompt"]`, `#composer-submit-button`

### 5.5 React `_valueTracker` Reset (Verified 2026-10-17)

Setting a controlled React textarea's `.value` directly silently breaks React's change detection, keeping the send button disabled. The correct write sequence:
1. Set `element._valueTracker?.setValue("")` to clear React's prior-value snapshot.
2. Set `element.value = newText`.
3. Dispatch `new InputEvent("input", { bubbles: true, inputType: "insertText", data: newText })`.

This causes React to detect a "change" from `""` to `newText` and re-enable the submit button.

### 5.6 Response Streaming
- ChatGPT streams responses using Server-Sent Events (`text/event-stream`).
- VeilGuard's backstop operates strictly on the **request** (outbound user payload). Response parsing for rehydration is scheduled for Phase 8.

---

## 6. Single-Page Application (SPA) Resilience

- ChatGPT utilizes Next.js with client-side routing.
- Navigating between chats (e.g. `https://chatgpt.com/` to `https://chatgpt.com/c/<id>`) replaces the composer DOM node without triggering a full page reload (`window.location` changes via `history.pushState`).
- **Resilience Mechanism:**
  - VeilGuard attaches window-level listeners with `{ capture: true }` at `document_start`. These listeners remain attached to `window` permanently across all client-side route changes.
  - Composer elements are resolved dynamically on each event (`getComposer()`), ensuring newly mounted DOM nodes are intercepted immediately without requiring re-binding.
  - A `MutationObserver` monitors DOM mutations to re-verify `adapter.selfTest()` and update badge states.

---

## 7. Content Security Policy (CSP) & Styling Considerations

- ChatGPT enforces strict CSP headers with Cloudflare origin protection.
- The VeilGuard review overlay is encapsulated within an isolated Shadow DOM (`#veilguard-overlay-host`, `mode: "open"`).
- To prevent CSP style-src restrictions from blocking injected `<style>` blocks:
  - The overlay uses inline style elements created in the isolated Shadow DOM, which is generally exempted from host page CSP in Chrome extensions.
  - If a future host update restricts inline styles within extension Shadow DOMs, the adapter will adopt constructable stylesheets (`sheet.replaceSync(...)`).
- Focus management: The review overlay traps focus (`tab` cycle) while visible and releases focus back to the composer upon dismissal or approval.

---

## 8. Terms of Service, Robots.txt & Automation Policy Summary

- **OpenAI Terms of Use:** Prohibit unauthorized scraping, automated data harvesting, or reverse engineering of the backend APIs.
- **Robots.txt:** Disallows autonomous web crawlers (`GPTBot`, generic scrapers) from crawling private chat paths.
- **VeilGuard Compliance:**
  - VeilGuard AI is NOT a scraper, bot, or automated client. It is a user-controlled client-side privacy firewall.
  - Automated testing follows Rule 22: all chat requests are stubbed locally via Playwright `page.route`. Zero requests reach OpenAI servers.
  - No evasion techniques (stealth plugins, fingerprint spoofers, CAPTCHA bypasses) are used.
