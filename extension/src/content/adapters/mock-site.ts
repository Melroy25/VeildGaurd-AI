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
    // Dynamic lookup: never cache across events
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
