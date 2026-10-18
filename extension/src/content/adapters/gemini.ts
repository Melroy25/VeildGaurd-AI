/**
 * VeilGuard AI - Target AI Site Adapter: Google Gemini (https://gemini.google.com)
 *
 * Implements context-based event resolution for Google Gemini's rich-textarea editor.
 * Verified DOM: [contenteditable="true"] inside <rich-textarea> with capture-phase Enter trap.
 */

import type { SiteAdapter, AdapterSelectorConfig, ComposerContext } from "./types";

export const GEMINI_SELECTORS = {
  mainComposers: [
    "rich-textarea div[contenteditable='true']",
    "div.ql-editor[contenteditable='true']",
    "div[contenteditable='true'][aria-label*='prompt' i]",
    "div[contenteditable='true']",
    "textarea",
  ],
  mainSendButtons: [
    "button[aria-label*='Send' i]",
    "button.send-button",
    "button[aria-label*='Submit' i]",
    "button:has(mat-icon)",
  ],
} as const;

export class GeminiAdapter implements SiteAdapter {
  readonly id = "gemini";
  readonly selectors: AdapterSelectorConfig = {
    textareaComposer: GEMINI_SELECTORS.mainComposers[0],
    contenteditableComposer: GEMINI_SELECTORS.mainComposers[0],
    sendButton: GEMINI_SELECTORS.mainSendButtons[0],
  };

  readonly chatEndpoint = /https?:\/\/[^/]+(?:\/_\/BardChatUi|\/api|\/v1)/;

  matches(location: Location): boolean {
    const host = location.hostname.toLowerCase();
    return host === "gemini.google.com" || host.endsWith(".gemini.google.com");
  }

  getComposer(): HTMLElement | null {
    for (const sel of GEMINI_SELECTORS.mainComposers) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
    }
    return null;
  }

  getSendButton(): HTMLElement | null {
    for (const sel of GEMINI_SELECTORS.mainSendButtons) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
    }
    return null;
  }

  isSendButton(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;
    for (const sel of GEMINI_SELECTORS.mainSendButtons) {
      if (target.closest(sel)) return true;
    }
    return false;
  }

  getForm(): HTMLFormElement | null {
    const composer = this.getComposer();
    return composer ? composer.closest("form") : null;
  }

  resolveContext(event: Event): ComposerContext | null {
    const target = event.target as Node | null;
    if (!target || !(target instanceof Element)) {
      return this.createMainContext();
    }

    const editable = target.closest<HTMLElement>('[contenteditable="true"], textarea');
    if (editable) {
      return {
        kind: "main",
        getText: () => {
          if (editable instanceof HTMLTextAreaElement) return editable.value.trim();
          return (editable.innerText || editable.textContent || "").trim();
        },
        setText: (text: string) => this.writeToElement(editable, text),
        triggerSend: () => this.triggerSend(),
      };
    }

    const mainComposer = this.getComposer();
    if (mainComposer && (mainComposer === target || mainComposer.contains(target))) {
      return this.createMainContext();
    }

    return null;
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
    if (!composer) return false;
    return this.writeToElement(composer, text);
  }

  private writeToElement(element: HTMLElement, text: string): boolean {
    element.focus();

    if (element instanceof HTMLTextAreaElement) {
      element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // Rich text editor
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    try {
      document.execCommand("insertText", false, text);
    } catch {
      element.innerText = text;
    }

    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
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

export const geminiAdapter = new GeminiAdapter();
