import { getAdapterForLocation } from "./adapters";
import { isFlagged } from "../shared/stub-detector";
import { showBlockedOverlay } from "./ui/overlay";
import { renderProtectionBadge } from "./ui/badge";

/**
 * VeilGuard AI - Content Script (DOM-level interception)
 *
 * Intercepts user submissions in the capture phase before host page event listeners fire.
 * Rule 7: Never log or persist prompt text. Only metadata is logged.
 */

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
          const text = adapter.getText();
          if (isFlagged(text)) {
            e.preventDefault();
            e.stopImmediatePropagation();

            // Metadata-only logging (Rule 7)
            console.log("[VeilGuard AI] Submission blocked", {
              path: "enter",
              length: text.length,
              blocked: true,
            });

            showBlockedOverlay();
          }
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
        const text = adapter.getText();
        if (isFlagged(text)) {
          e.preventDefault();
          e.stopImmediatePropagation();

          // Metadata-only logging (Rule 7)
          console.log("[VeilGuard AI] Submission blocked", {
            path: "click",
            length: text.length,
            blocked: true,
          });

          showBlockedOverlay();
        }
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
        const text = adapter.getText();
        if (isFlagged(text)) {
          e.preventDefault();
          e.stopImmediatePropagation();

          // Metadata-only logging (Rule 7)
          console.log("[VeilGuard AI] Submission blocked", {
            path: "submit",
            length: text.length,
            blocked: true,
          });

          showBlockedOverlay();
        }
      }
    },
    { capture: true }
  );

  // 4. Backstop Notification Listener (from MAIN-world page-world script)
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    if (event.data && event.data.type === "VEILGUARD_BACKSTOP_BLOCKED") {
      console.log("[VeilGuard AI] Submission blocked by MAIN-world backstop", {
        path: event.data.transport || "backstop",
        blocked: true,
      });
      showBlockedOverlay();
    }
  });

  // 5. Run Adapter Self-Test & Mount Protection Badge
  adapter.selfTest().then((passed) => {
    renderProtectionBadge(passed);
  });
})();
