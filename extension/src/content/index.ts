/**
 * VeilGuard AI - Content Script (DOM-level interception)
 *
 * Intercepts user submissions in the capture phase before host page event
 * listeners fire. All interception logic is delegated to flow.ts (state
 * machine), which handles engine analysis, overlay display, and audit logging.
 *
 * Rule 7: Never log or persist raw prompt text. Only metadata is logged.
 * Rule 6: Fail closed — if the engine is unreachable, submissions are blocked.
 */

import { getAdapterForLocation } from "./adapters";
import { handleInterception, handleBackstopBlocked, mountBadge } from "./flow";
import type { GetStatusResponse } from "../shared/messages";

// ---------------------------------------------------------------------------
// GET_STATUS: popup queries this content script for the page's protection state.
// Accepted only from the extension itself (background validates sender.id).
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (r: GetStatusResponse) => void
  ): boolean => {
    if (
      message &&
      typeof message === "object" &&
      (message as { type?: string }).type === "GET_STATUS"
    ) {
      const adapter = getAdapterForLocation(window.location);
      if (!adapter) {
        sendResponse({ ok: true, status: "active" });
        return false;
      }
      adapter.selfTest().then((passed) => {
        sendResponse({
          ok: true,
          status: passed ? "active" : "adapter self-test failed",
        });
      });
      return true; // keep channel open for async response
    }
    return false;
  }
);

(() => {
  const adapter = getAdapterForLocation(window.location);
  if (!adapter) {
    return;
  }

  // 1. Capture-phase Keyboard Listener (Enter key)
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      // Ignore IME composition and Shift+Enter
      if (e.isComposing || e.keyCode === 229 || e.shiftKey) {
        return;
      }

      if (e.key === "Enter") {
        const composer = adapter.getComposer();
        const target = e.target as Node | null;

        if (composer && target && (composer === target || composer.contains(target))) {
          handleInterception(adapter, e, "enter");
        }
      }
    },
    { capture: true }
  );

  // 2. Capture-phase Click Listener (Send button)
  window.addEventListener(
    "click",
    (e: MouseEvent) => {
      if (adapter.isSendButton(e.target)) {
        handleInterception(adapter, e, "click");
      }
    },
    { capture: true }
  );

  // 3. Capture-phase Form Submit Listener
  window.addEventListener(
    "submit",
    (e: SubmitEvent) => {
      const form = adapter.getForm();
      const target = e.target as Node | null;

      if (form && target && (form === target || form.contains(target))) {
        handleInterception(adapter, e, "submit");
      }
    },
    { capture: true }
  );

  // 4. Backstop Notification Listener (from MAIN-world page-world script via postMessage)
  window.addEventListener("message", (event: MessageEvent) => {
    // Only accept messages from our own frame — never from cross-origin frames
    if (event.source !== window) return;

    if (event.data && event.data.type === "VEILGUARD_BACKSTOP_BLOCKED") {
      const transport = event.data.transport === "xhr" ? "xhr" : "fetch";
      handleBackstopBlocked(transport);
    }
  });

  // 5. Mount adapter self-test and protection badge
  mountBadge(adapter);
})();
