import { SiteAdapter, AdapterSelectorConfig } from "./types";

/**
 * Centralized DOM selector configuration for the Mock AI Chat site.
 * Rule 15: Site-specific details reside in adapter config, not scattered across content scripts.
 */
const MOCK_SITE_SELECTORS: AdapterSelectorConfig = {
  textareaComposer: "#chat-composer-textarea",
  contenteditableComposer: "#chat-composer-editable",
  sendButton: "#send-btn",
  form: "#chat-form",
  programmaticButton: "#send-programmatic",
};

export class MockSiteAdapter implements SiteAdapter {
  readonly id = "mock-ai-site";
  readonly selectors = MOCK_SITE_SELECTORS;

  matches(location: Location): boolean {
    const isMockHost = location.hostname === "127.0.0.1" || location.hostname === "localhost";
    const isMockPort = location.port === "4310";
    return isMockHost && isMockPort;
  }

  getComposer(): HTMLElement | null {
    // Dynamic lookup: never cache across events to handle SPA re-renders
    return (
      document.querySelector<HTMLTextAreaElement>(this.selectors.textareaComposer) ||
      document.querySelector<HTMLDivElement>(this.selectors.contenteditableComposer)
    );
  }

  getText(): string {
    const composer = this.getComposer();
    if (!composer) return "";

    if (composer instanceof HTMLTextAreaElement) {
      return composer.value;
    }
    // Contenteditable or standard HTMLElement
    return composer.innerText ?? composer.textContent ?? "";
  }

  /**
   * Sets text in the active composer, firing a real bubbling "input" event
   * so that React controlled components and mock-site controlled state mode
   * pick up the new value.
   *
   * Textarea: Uses the native HTMLInputElement.value descriptor setter to
   * bypass React's synthetic event tracking, then dispatches a bubbling
   * InputEvent. This pattern is required because React caches the previous
   * value and ignores direct property assignment without native setter invocation.
   *
   * Contenteditable: Selects all content and replaces it via execCommand("insertText")
   * which fires the correct sequence of composition/input events. Falls back to
   * textContent assignment + manual input event when execCommand is unsupported.
   *
   * Returns true if post-set verification confirms the text was applied.
   */
  setText(text: string): boolean {
    const composer = this.getComposer();
    if (!composer) return false;

    if (composer instanceof HTMLTextAreaElement) {
      // Use native descriptor setter so React's internal fiber tracking is bypassed
      const nativeDescriptor = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      );
      if (nativeDescriptor?.set) {
        nativeDescriptor.set.call(composer, text);
      } else {
        composer.value = text;
      }
      // Dispatch a bubbling InputEvent so controlled components (React/Vue) and
      // the mock-site controlled state handler receive the update
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      return this.verifyText(composer, text);
    } else {
      // Contenteditable: select-all then insertText for full event compatibility
      composer.focus();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // execCommand fires compositionend, input, and other required events
      const inserted = document.execCommand("insertText", false, text);
      if (!inserted) {
        // Fallback: direct textContent assignment
        composer.textContent = text;
      }
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      return this.verifyText(composer, text);
    }
  }

  /**
   * Verifies that the composer element now reflects the expected text.
   * Used after setText() to confirm the value was accepted.
   */
  private verifyText(composer: HTMLElement, expectedText: string): boolean {
    if (composer instanceof HTMLTextAreaElement) {
      return composer.value === expectedText;
    }
    // For contenteditable, trim whitespace differences from execCommand
    const actual = (composer.innerText ?? composer.textContent ?? "").trim();
    return actual === expectedText.trim();
  }

  getSendButton(): HTMLElement | null {
    return document.querySelector<HTMLElement>(this.selectors.sendButton);
  }

  isSendButton(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) {
      return false;
    }
    return Boolean(target.closest(this.selectors.sendButton));
  }

  getForm(): HTMLFormElement | null {
    if (!this.selectors.form) return null;
    return document.querySelector<HTMLFormElement>(this.selectors.form);
  }

  /**
   * Programmatically triggers submission via the appropriate DOM path.
   *
   * If a form is present, dispatches a submit event on it (form wiring).
   * Otherwise clicks the send button (click wiring).
   *
   * Used by the review overlay "Send Sanitized" approval path.
   */
  triggerSend(): void {
    const form = this.getForm();
    if (form) {
      // Dispatch a real submit event on the form so the page's submit listener fires
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      return;
    }
    const btn = this.getSendButton();
    if (btn) {
      btn.click();
    }
  }

  async selfTest(timeoutMs: number = 3000): Promise<boolean> {
    if (this.getComposer() && this.getSendButton()) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const observer = new MutationObserver(() => {
        if (this.getComposer() && this.getSendButton()) {
          cleanup(true);
        }
      });

      const cleanup = (result: boolean) => {
        if (timer) clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      };

      timer = setTimeout(() => {
        cleanup(Boolean(this.getComposer() && this.getSendButton()));
      }, timeoutMs);

      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      } else {
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            if (this.getComposer() && this.getSendButton()) {
              cleanup(true);
            } else if (document.body) {
              observer.observe(document.body, { childList: true, subtree: true });
            }
          },
          { once: true }
        );
      }
    });
  }
}

export const mockSiteAdapter = new MockSiteAdapter();
