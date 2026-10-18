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
import {
  handleInterception,
  handleBackstopBlocked,
  mountBadge,
  handleAttachmentNotice,
  observeBackstopRequest,
  startBackstopCanary,
} from "./flow";
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
        const ctx = adapter.resolveContext(e);
        if (ctx) {
          handleInterception(adapter, e, "enter", ctx);
          return;
        }

        // Resilient fallback for mock site, custom components, or activeElement
        const composer = adapter.getComposer();
        const target = e.target as Node | null;
        const active = document.activeElement;

        const isInsideComposer = Boolean(composer && target && (composer === target || composer.contains(target)));
        const isActiveEditable = Boolean(
          active instanceof HTMLElement &&
            (active.isContentEditable ||
              active.tagName === "TEXTAREA" ||
              active.tagName === "RICH-TEXTAREA" ||
              active.getAttribute("role") === "textbox")
        );

        if (isInsideComposer || isActiveEditable) {
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
        const ctx = adapter.resolveContext(e);
        handleInterception(adapter, e, "click", ctx ?? undefined);
      }
    },
    { capture: true }
  );

  // 3. Capture-phase Form Submit Listener
  window.addEventListener(
    "submit",
    (e: SubmitEvent) => {
      const ctx = adapter.resolveContext(e);
      if (ctx) {
        handleInterception(adapter, e, "submit", ctx);
        return;
      }

      const form = adapter.getForm();
      const target = e.target as Node | null;
      if (form && target && (form === target || form.contains(target))) {
        handleInterception(adapter, e, "submit");
      }
    },
    { capture: true }
  );

  // 4. Attachment Detection (Phase 4 Part B, Section 6.3 - notice only)
  window.addEventListener(
    "change",
    (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target instanceof HTMLInputElement && target.type === "file") {
        if (target.files && target.files.length > 0) {
          handleAttachmentNotice();
        }
      }
    },
    { capture: true }
  );

  window.addEventListener(
    "drop",
    (e: DragEvent) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleAttachmentNotice();
      }
    },
    { capture: true }
  );

  // 5. Backstop Notifications & Canary Listener
  window.addEventListener("message", (event: MessageEvent) => {
    // Only accept messages from our own frame — never from cross-origin frames
    if (event.source !== window) return;

    if (event.data && event.data.type === "VEILGUARD_BACKSTOP_BLOCKED") {
      const transport = event.data.transport === "xhr" ? "xhr" : "fetch";
      handleBackstopBlocked(transport);
    } else if (event.data && event.data.type === "VEILGUARD_CHAT_OBSERVED") {
      observeBackstopRequest();
    } else if (event.data && event.data.type === "VEILGUARD_TRIGGER_TEST_CANARY") {
      startBackstopCanary();
    }
  });

  // 6. Mount adapter self-test and protection badge
  mountBadge(adapter);
})();

