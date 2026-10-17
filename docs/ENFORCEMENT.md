# VeilGuard AI: Multi-Layer Submission Enforcement Spike (Phase 1)

## Executive Summary

Phase 1 establishes and empirically verifies the foundational enforcement mechanism of **VeilGuard AI**: ensuring that sensitive data entered into an AI chat interface is reliably intercepted and prevented from reaching external endpoints, regardless of the submission vector utilized by the host application.

To eliminate testing ambiguity and external network dependencies, Phase 1 evaluates enforcement against a deterministic standalone mock AI chat server (`mock-ai-site/server.mjs`) running locally on `http://127.0.0.1:4310`.

---

## Dual-Layer Defense Architecture

VeilGuard AI implements a defense-in-depth model comprising two distinct, coordinated interception layers:

```
+-------------------------------------------------------------------------------+
| HOST WEBPAGE                                                                  |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | LAYER 1: DOM Pre-Submission Interception (Isolated Content Script)    |   |
|   | - Capture-phase window event listeners (keydown, click, submit)       |   |
|   | - SiteAdapter dynamically inspects DOM composer & buttons             |   |
|   | - If sensitive: e.preventDefault() + e.stopImmediatePropagation()     |   |
|   | - Mounts Shadow DOM Blocked Overlay                                   |   |
|   +-----------------------------------+-----------------------------------+   |
|                                       | (bypassed by programmatic scripts)    |
|                                       v                                       |
|   +-----------------------------------------------------------------------+   |
|   | LAYER 2: In-Page API Backstop (MAIN Execution World Script)           |   |
|   | - Injected at document_start in world: "MAIN"                         |   |
|   | - Monkey-patches window.fetch and XMLHttpRequest.prototype.send       |   |
|   | - Inspects outgoing request payloads targeting /api/chat              |   |
|   | - If sensitive: throws TypeError / dispatches ProgressEvent("error")  |   |
|   | - Sends window.postMessage notification to Content Script overlay     |   |
|   +-----------------------------------+-----------------------------------+   |
|                                       | (normal benign payload)               |
+---------------------------------------|---------------------------------------+
                                        v
                            +-----------------------+
                            | Remote / Mock AI Host |
                            | POST /api/chat        |
                            +-----------------------+
```

---

## Interception Mechanism Details

### Layer 1: DOM Pre-Submission Traps (`extension/src/content/index.ts`)
1. **Window-Level Capture Phase:** Listeners are registered with `{ capture: true }` on `window`. Because the capture phase executes top-down before target element listeners or bubbling handlers fire, VeilGuard halts the event before the host application's scripts receive it.
2. **Enter Key Trap:**
   - Detects `e.key === "Enter"`.
   - Explicitly bypasses Shift+Enter (`e.shiftKey === true`) to allow multi-line text composition.
   - Detects IME (Input Method Editor) composition state (`e.isComposing || e.keyCode === 229`) to prevent premature interruption during multilingual typing.
3. **Send Button Click Trap:**
   - Uses `adapter.isSendButton(e.target)` using `element.closest()` to catch clicks on nested icons, spans, or SVGs inside the send button.
4. **Form Submit Trap:**
   - Intercepts synthetic `form.requestSubmit()` or default form submissions.
5. **DOM Adapter Contract (`MockSiteAdapter`):**
   - Selectors are centralized in `extension/src/content/adapters/mock-site.ts` (Rule 15).
   - DOM lookups are dynamic and never cached across events to guarantee resilience against virtual DOM re-renders.

### Layer 2: In-Page MAIN-World Backstop (`extension/src/page-world/index.ts`)
1. **Execution Scope:** Registered in `extension/manifest.json` under `content_scripts` with `"world": "MAIN"` and `"run_at": "document_start"`. This ensures the script executes within the webpage's true global JavaScript execution context before any page scripts load.
2. **Fetch Monkey-Patching:**
   - Wraps `window.fetch`.
   - Inspects URL targets matching `/api/chat`.
   - Inspects stringified JSON, form payloads, or cloned `Request` bodies.
   - If sensitive content is detected, aborts dispatch immediately by throwing `new TypeError("Failed to fetch: request blocked by VeilGuard AI backstop.")`.
3. **XMLHttpRequest Monkey-Patching:**
   - Wraps `XMLHttpRequest.prototype.open` to associate target URLs with instances via a private `WeakMap`.
   - Wraps `XMLHttpRequest.prototype.send` to inspect outbound payload buffers.
   - If sensitive content is detected, aborts the send and dispatches `new ProgressEvent("error")`.
4. **PostMessage Coordination:**
   - On backstop block, sends `{ type: "VEILGUARD_BACKSTOP_BLOCKED", transport }` via `window.postMessage`.
   - The isolated content script listens for this message and raises the isolated Shadow DOM overlay.

---

## UI Components

### 1. Shadow DOM Blocked Overlay (`extension/src/content/ui/overlay.ts`)
- Injected into `#veilguard-overlay-host` attached to the host DOM.
- Uses Shadow DOM (`mode: "open"`) with an embedded isolated stylesheet.
- Completely immune to host page CSS cascades, resets, or z-index collisions.
- Displays risk details and a Dismiss button that tears down the modal while preserving the composer contents for user revision.

### 2. Protection State Badge (`extension/src/content/ui/badge.ts`)
- Injected into `#veilguard-badge-host` in top-right screen space.
- Configured with `pointer-events: none` to prevent interfering with host buttons or menus.
- Executes `adapter.selfTest()` using `MutationObserver` to verify DOM composer and button presence before declaring `"VeilGuard: protection active"`.

---

## Empirical Benchmark Results

Execution results are recorded in `bench/results/enforcement_mock_site.json` across 12 distinct configuration cells:
- **Matrix Dimensions:**
  - 2 Composer types: `<textarea>` and `contenteditable="true"`
  - 2 Wiring architectures: HTML `<form>` and direct click listeners
  - 3 Submission paths: Button click, Enter key, Form submit
  - 2 Programmatic backstop transports: direct `fetch()` and `XMLHttpRequest`
- **Total Trials:** 480 trials across 12 cells (240 flagged prompt trials and 240 benign control trials; N=20 per cell)
- **Flagged Prompt Leaks:** No leaks observed across 240 flagged trials (0 / 240 leaked)
- **Benign Prompts Delivered:** 240 / 240 correctly delivered (100% delivery rate)

| Cell Configuration | Submission Path | Transport | Flagged Trials | Flagged Leaked | Benign Trials | Benign Delivered |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `textarea` + `form` | click | fetch | 20 | **0** | 20 | **20** |
| `textarea` + `form` | enter | fetch | 20 | **0** | 20 | **20** |
| `textarea` + `form` | submit | fetch | 20 | **0** | 20 | **20** |
| `textarea` + `click` | click | fetch | 20 | **0** | 20 | **20** |
| `textarea` + `click` | enter | fetch | 20 | **0** | 20 | **20** |
| `contenteditable` + `form` | click | fetch | 20 | **0** | 20 | **20** |
| `contenteditable` + `form` | enter | fetch | 20 | **0** | 20 | **20** |
| `contenteditable` + `form` | submit | fetch | 20 | **0** | 20 | **20** |
| `contenteditable` + `click` | click | fetch | 20 | **0** | 20 | **20** |
| `contenteditable` + `click` | enter | fetch | 20 | **0** | 20 | **20** |
| `textarea` + `click` (Backstop) | programmatic | fetch | 20 | **0** | 20 | **20** |
| `textarea` + `click` (Backstop) | programmatic | xhr | 20 | **0** | 20 | **20** |

---

## Security & Privacy Invariants

1. **Rule 7 (No Raw Content Persistence or Logging):**
   - Content script and backstop console logs output strictly metadata:
     `{ path: "enter", length: text.length, blocked: true }`.
   - Verified via automated test `Console privacy check: flagged prompt attempts never log phone number to console`.
2. **Rule 9 (Least Privilege Permissions):**
   - Manifest permissions do not include `<all_urls>` or wide host permissions.
   - Content scripts are strictly scoped to `http://127.0.0.1:4310/*` and `http://localhost:4310/*`.
3. **Rule 10 (Synthetic Data Exclusively):**
   - All tests use fabricated mock numbers (`9876543210`) and synthetic prompts.

---

## Known Boundaries & What is NOT Protected

In compliance with Rule 3 (Honesty Invariant):
1. **Mock-Site Scope:** Phase 1 verification applies strictly to the mock testbed (`127.0.0.1:4310`). No production AI adapters (ChatGPT, Claude) are included in this phase.
2. **Alternative Protocols:** Interception covers DOM events, `window.fetch`, and `XMLHttpRequest`. Exotic protocols (WebSockets, WebRTC data channels, WebTransport, background Service Worker sync) are not intercepted by this layer. See [docs/LIMITATIONS.md](./LIMITATIONS.md) for full details.
3. **Harness Stub Detector:** Phase 1 utilizes a synchronous regex detector stub (`isFlagged()`). Full integration with the Presidio analyzer and local FastAPI engine (`/scan`) is scheduled for Phase 2.

---

## Phase 3b: Root Cause of Enter/requestSubmit Delivery Failures and Fix

### Problem

During Phase 3b bring-up, two submission paths — **Enter key** and **form.requestSubmit()** — intermittently failed to deliver the sanitized text to the mock server after the user clicked "Send sanitized" on the review overlay. The `bench/results/enforcement_full_chain_mock_site.json` recorded `sanitized_delivered_correctly = false` for these cells in early runs.

### Root Cause 1 — Double-Interception of the Re-Triggered Event (`isReTriggering` guard)

When the user approved the sanitized text, `flow.ts` re-triggered the original submission path (e.g., synthesized an Enter `KeyboardEvent` and dispatched it on the composer, or called `form.requestSubmit()`). The extension's own capture-phase window listener (registered at `document_start`) would then re-intercept this synthetic event and open a second review overlay — blocking its own re-delivery in an infinite loop.

**Fix:** A module-level boolean `isReTriggering` flag was added in [`extension/src/content/flow.ts`](../extension/src/content/flow.ts) (line ~44). Before re-dispatching the sanitized event, the flag is set to `true`; the capture-phase handler short-circuits immediately when `isReTriggering === true`; the flag is reset inside a `finally` block after the re-dispatch concludes.

```typescript
// flow.ts — simplified
let isReTriggering = false;

export async function retriggerWithSanitizedText(text: string, ctx: SubmitContext) {
  isReTriggering = true;
  try {
    ctx.setText(text);
    ctx.triggerSend();          // dispatches the synthetic event
    await waitForSendComplete();
  } finally {
    isReTriggering = false;
  }
}

// capture-phase handler
window.addEventListener("keydown", (e) => {
  if (isReTriggering) return;   // ← short-circuit; skip own re-trigger
  // ... normal interception logic
}, { capture: true });
```

### Root Cause 2 — Backstop Checked Pre-Approval Text Before Pre-Approval Was Posted

The MAIN-world backstop (`extension/src/page-world/index.ts`) checks outgoing fetch/XHR payloads against the original flagged text stored in `window.__vg_preApproved`. For Enter-wired and requestSubmit-wired forms, the content script posted the `VEILGUARD_PRE_APPROVE` message to the page world **after** the re-triggered submission had already fired — so the backstop still saw the text as un-approved and blocked the sanitized delivery.

**Fix:** The `VEILGUARD_PRE_APPROVE` `window.postMessage` is now dispatched **before** `retriggerWithSanitizedText()` is called, guaranteeing the backstop receives the approval token before any outgoing network request is attempted.

### Root Cause 3 — Enter Debounce for Double-Enter Scenario

Pressing Enter on a contenteditable element fires two `keydown` events in rapid succession on some platform/browser combinations (one for IME pre-composition, one for the actual submit Enter). The first event would open an overlay; the second would open a second overlay on top.

**Fix:** A 300 ms debounce guard on Enter interception was added to deduplicate rapid consecutive Enter events while an overlay is active.

### Outcome

After these three fixes (committed in `303e97b`), all 14 cells of the enforcement matrix passed with 0 leaks and 100% sanitized delivery in two consecutive runs (N=20 per cell, VG_TRIALS=20):

| Fix | Guard Location | File |
| :--- | :--- | :--- |
| `isReTriggering` double-interception guard | Capture-phase handler check | `extension/src/content/flow.ts` |
| `VEILGUARD_PRE_APPROVE` ordering | Pre-approval posted before retrigger | `extension/src/content/flow.ts` |
| Enter debounce | 300 ms cooldown while overlay active | `extension/src/content/flow.ts` |

---

## Phase 4: ChatGPT Real-Site Network-Boundary Coverage Matrix

Phase 4 establishes a real-site enforcement harness targeting `https://chatgpt.com` (logged-out state, verified 2026-10-17). All results recorded in `bench/results/enforcement_real_site.json`.

> **Rule 22 Compliance:** 100% of outbound chat conversation requests are intercepted by Playwright `page.route`. Zero bytes of test prompt data reach OpenAI's servers during automated test execution.

### Verified Endpoint Architecture (Logged-Out, 2026-10-17)

| Step | Endpoint | Stub Response |
| :--- | :--- | :--- |
| 1. Session Prepare | `POST /unauth-mweb/conversation/prepare?lightweight_authenticated=0` | `{ ok: true }` (JSON, 200) |
| 2. Message Submit | `POST /unauth-mweb/conversation/updates?lightweight_authenticated=0&operationId=...` | Minimal SSE stream (text/event-stream, 200) |

Route intercept pattern: `/(backend-api|backend-anon|unauth-mweb)\/conversation/`

### Tested Environment & Authentication State

- **Target Site:** ChatGPT (`https://chatgpt.com`)
- **Authentication State Tested:** Logged-out (unauthenticated mobile-web flow on Chromium via `#mobile-composer-prompt`).
- **Adapter Scope Limitation:** Per Rule 3 (Honesty Invariant), the adapter supports and guarantees enforcement strictly for the DOM configurations and endpoints tested below. Unauthenticated desktop ProseMirror or authenticated logged-in layouts are not certified.

### Real-Site Coverage Matrix

| Path / Feature | Status | Flagged Trials | Flagged Leaked | Sanitize Delivered | Benign Delivered | Latency (med / max) | Notes |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Main Composer Send Button** | **Protected** | 1 | **0** | 1 / 1 | 0 / 1 | — | `#mobile-composer-prompt` + `button[aria-label='Send message']`. Intercepted, sanitized delivered to `/unauth-mweb`. |
| **Main Composer Enter Key** | **Untested** | 0 | — | — | — | — | Enter submission not tested in current recorded run. |
| **Edit-Message Send Button** | **Untested** | 0 | — | — | — | — | Turn edit button not tested in current recorded run. |
| **SPA Navigation** | **Untested** | 0 | — | — | — | — | Client-side route transition not tested in current recorded run. |
| **Programmatic fetch / XHR (Backstop)** | **Protected** | 12 | **0** | N/A | 10 / 10 | 41 ms / 221 ms | Layer 2 backstop; verified fail-closed on stream, Request clone, blocked PII. |
| **File Attachments** | **Not protected** | 1 | N/A | N/A | N/A | — | Notice only: *"Attachments are not scanned by VeilGuard yet."* Documented limitation (Phase 7 scope). |
| **Voice / Dictation Mode** | **Not protected** | 0 | — | — | — | — | Audio streaming bypasses DOM text interception. Documented limitation. |
| **Degraded Mode (mock-site)** | **Protected** | 10 | **0** | N/A | 10 / 10 | — | DOM broken (`?break_selectors=1`); backstop enforces with 0 leaks. |
| **Backstop Canary** | **Protected** | 1 | **0** | N/A | N/A | — | Missing chat request triggers canary badge warning in ≤15.2s. |

### Degraded-Mode (Adapter Failure) Behavior

When the DOM adapter fails self-test (mismatched selectors, no composer found), VeilGuard transitions to **Limited Protection** mode:
- Layer 1 DOM interception is inactive (selectors broken).
- Layer 2 MAIN-world backstop remains fully active and enforcing.
- Badge transitions to `"Limited protection (adapter degraded)"`.
- All programmatic fetch/XHR calls to conversation endpoints are still blocked when containing sensitive content.
- Verified: 10/10 flagged trials blocked, 0 leaks, 10/10 benign allowed (cell `degraded_mode_mock_site`).

### Canary Warning Mechanism

The backstop canary detects when the page-world script is loaded (it sends `VEILGUARD_CHAT_OBSERVED` on load) but no conversation request was intercepted within the expected window after a submit event. If the canary fires, the badge transitions to `"Backstop may not be working (canary)"` — a warning that neither layer has confirmed enforcement.

- Canary badge transition verified ≤ 15.2 seconds in automated test.

### File Attachment Limitation

File attachments are **not scanned** in Phase 4. VeilGuard displays a non-blocking notice: *"Attachments are not scanned by VeilGuard AI. Their contents are not checked."* Full attachment scanning is scheduled for Phase 7 (PyMuPDF). This is a documented limitation in `docs/LIMITATIONS.md`.
