/**
 * VeilGuard AI - Target AI Site Adapter: Universal AI Adapter
 *
 * Provides resilient, context-aware protection across all supported AI tools:
 * - Claude (claude.ai)
 * - Perplexity (perplexity.ai)
 * - DeepSeek (chat.deepseek.com)
 * - Microsoft Copilot (copilot.microsoft.com)
 * - Poe (poe.com)
 * - Mistral (chat.mistral.ai)
 * - Google AI Studio (aistudio.google.com)
 * - HuggingChat (huggingface.co/chat)
 * - Fallback for any target AI host
 */

import type { SiteAdapter, AdapterSelectorConfig, ComposerContext } from "./types";

const SUPPORTED_AI_HOST_PATTERNS = [
  "claude.ai",
  "perplexity.ai",
  "deepseek.com",
  "copilot.microsoft.com",
  "poe.com",
  "mistral.ai",
  "aistudio.google.com",
  "huggingface.co",
  "gemini.google.com",
  "chatgpt.com",
  "codex.openai.com",
];

export const UNIVERSAL_SELECTORS = {
  mainComposers: [
    "div.ProseMirror[contenteditable='true']",
    "div.ql-editor[contenteditable='true']",
    "div[contenteditable='true'][role='textbox']",
    "div[contenteditable='true']",
    "rich-textarea",
    "textarea#prompt-textarea",
    "textarea#chat-input",
    "textarea[placeholder*='Ask' i]",
    "textarea[placeholder*='Message' i]",
    "textarea[placeholder*='Prompt' i]",
    "textarea[aria-label*='prompt' i]",
    "textarea[aria-label*='message' i]",
    "textarea",
  ],
  mainSendButtons: [
    "button[aria-label*='Send' i]",
    "button[aria-label*='Submit' i]",
    "button[data-testid*='send' i]",
    "button[data-testid*='submit' i]",
    "button.send-button",
    "button[type='submit']",
    "[role='button'][aria-label*='Send' i]",
    "[role='button'][aria-label*='Submit' i]",
    "button:has(svg)",
    "button:has(mat-icon)",
  ],
} as const;

function getDeepActiveElement(): Element | null {
  let active: Element | null = document.activeElement;
  while (active && (active as HTMLElement).shadowRoot && (active as HTMLElement).shadowRoot?.activeElement) {
    active = (active as HTMLElement).shadowRoot!.activeElement;
  }
  return active;
}

export class UniversalAIAdapter implements SiteAdapter {
  readonly id = "universal";
  readonly selectors: AdapterSelectorConfig = {
    textareaComposer: UNIVERSAL_SELECTORS.mainComposers[0],
    contenteditableComposer: UNIVERSAL_SELECTORS.mainComposers[0],
    sendButton: UNIVERSAL_SELECTORS.mainSendButtons[0],
  };

  readonly chatEndpoint = /https?:\/\/[^/]+(?:\/api|\/backend|\/v1|\/chat|\/conversation|\/completion)/;

  matches(location: Location): boolean {
    const host = location.hostname.toLowerCase();
    for (const pattern of SUPPORTED_AI_HOST_PATTERNS) {
      if (host === pattern || host.endsWith("." + pattern)) {
        return true;
      }
    }
    return false;
  }

  getComposer(): HTMLElement | null {
    // 1. Deep active element if editable
    const deepActive = getDeepActiveElement();
    if (
      deepActive instanceof HTMLElement &&
      (deepActive.isContentEditable ||
        deepActive instanceof HTMLTextAreaElement ||
        deepActive.getAttribute("role") === "textbox")
    ) {
      return deepActive;
    }

    // 2. Main composer selectors
    for (const sel of UNIVERSAL_SELECTORS.mainComposers) {
      try {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      } catch {}
    }

    // 3. Fallback: Any visible contenteditable or textarea
    const anyEditable = document.querySelector<HTMLElement>("[contenteditable='true'], textarea");
    if (anyEditable) return anyEditable;

    return null;
  }

  getSendButton(): HTMLElement | null {
    for (const sel of UNIVERSAL_SELECTORS.mainSendButtons) {
      try {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      } catch {}
    }
    return null;
  }

  isSendButton(target: EventTarget | null): boolean {
    if (!target) return false;
    const path =
      typeof (target as unknown as { composedPath?: () => EventTarget[] }).composedPath === "function"
        ? (target as unknown as { composedPath: () => EventTarget[] }).composedPath()
        : [target];

    for (const node of path) {
      const isElement =
        typeof Element !== "undefined"
          ? node instanceof Element
          : Boolean(node && typeof (node as unknown as { getAttribute?: unknown }).getAttribute === "function");

      if (isElement) {
        const el = node as unknown as Element;
        const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
        const testId = (el.getAttribute("data-test-id") || el.getAttribute("data-testid") || "").toLowerCase();
        const title = (el.getAttribute("title") || "").toLowerCase();

        if (
          ariaLabel.includes("send") ||
          ariaLabel.includes("submit") ||
          testId.includes("send") ||
          testId.includes("submit") ||
          title.includes("send") ||
          title.includes("submit")
        ) {
          if (
            el.tagName === "BUTTON" ||
            el.getAttribute("role") === "button" ||
            el.closest?.("button, [role='button']")
          ) {
            return true;
          }
        }

        if (el.classList?.contains("send-button") || el.closest?.(".send-button")) {
          return true;
        }

        for (const sel of UNIVERSAL_SELECTORS.mainSendButtons) {
          try {
            if (el.matches?.(sel) || el.closest?.(sel)) {
              return true;
            }
          } catch {}
        }
      }
    }
    return false;
  }

  getForm(): HTMLFormElement | null {
    const composer = this.getComposer();
    return composer ? composer.closest("form") : null;
  }

  resolveContext(event: Event): ComposerContext | null {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];

    // 1. Check path nodes for editable elements
    for (const node of path) {
      const isHtml =
        typeof HTMLElement !== "undefined"
          ? node instanceof HTMLElement
          : Boolean(node && (node as unknown as { tagName?: unknown }).tagName);

      if (isHtml) {
        const el = node as unknown as HTMLElement;
        const editable =
          el.closest?.<HTMLElement>("[contenteditable='true'], textarea, [role='textbox']") ||
          (el.isContentEditable || el instanceof HTMLTextAreaElement ? el : null);

        if (editable) {
          return this.createContextForElement(editable);
        }
      }
    }

    // 2. Check deep activeElement
    const deepActive = getDeepActiveElement();
    if (
      deepActive instanceof HTMLElement &&
      (deepActive.isContentEditable || deepActive instanceof HTMLTextAreaElement)
    ) {
      return this.createContextForElement(deepActive);
    }

    // 3. Fallback to getComposer
    const composer = this.getComposer();
    if (composer) {
      return this.createContextForElement(composer);
    }

    // 4. If any prompt text exists anywhere
    const text = this.getText();
    if (text) {
      return this.createMainContext();
    }

    return null;
  }

  private createContextForElement(element: HTMLElement): ComposerContext {
    return {
      kind: "main",
      getText: () => {
        if (element instanceof HTMLTextAreaElement) {
          return element.value.trim();
        }
        return (element.innerText || element.textContent || "").trim();
      },
      setText: (text: string) => this.writeToElement(element, text),
      triggerSend: () => this.triggerSend(),
    };
  }

  private createMainContext(): ComposerContext {
    return {
      kind: "main",
      getText: () => this.getText(),
      setText: (text: string) => this.setText(text),
      triggerSend: () => this.triggerSend(),
    };
  }

  getText(): string {
    const composer = this.getComposer();
    if (!composer) return "";
    if (composer instanceof HTMLTextAreaElement) return composer.value.trim();
    return (composer.innerText || composer.textContent || "").trim();
  }

  setText(text: string): boolean {
    const composer = this.getComposer();
    if (composer) {
      return this.writeToElement(composer, text);
    }
    return false;
  }

  private writeToElement(element: HTMLElement, text: string): boolean {
    element.focus();

    if (element instanceof HTMLTextAreaElement) {
      element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return true;
    }

    // ContentEditable elements (ProseMirror / Quill / standard)
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      try {
        const inputEvent = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: "insertText",
          data: text,
        });
        element.dispatchEvent(inputEvent);
      } catch {}

      element.innerText = text;
    }

    try {
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: text,
        })
      );
    } catch {
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  }

  triggerSend(): void {
    const btn = this.getSendButton();
    if (btn && !(btn as HTMLButtonElement).disabled) {
      btn.click();
      return;
    }

    const composer = this.getComposer();
    if (composer) {
      composer.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    }
  }

  async extractUserText(body: unknown): Promise<string | null> {
    if (!body || typeof body !== "string") return null;
    return body;
  }

  async selfTest(): Promise<boolean> {
    return Boolean(this.getComposer());
  }
}

export const universalAIAdapter = new UniversalAIAdapter();
