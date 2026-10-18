/**
 * VeilGuard AI - Target AI Site Adapter: Google Gemini (https://gemini.google.com)
 *
 * Implements context-based event resolution for Google Gemini's rich-textarea editor.
 * Resilient against Web Components, Shadow DOM encapsulation, Quill editor variants,
 * and retargeted activeElement focus.
 */

import type { SiteAdapter, AdapterSelectorConfig, ComposerContext } from "./types";

export const GEMINI_SELECTORS = {
  mainComposers: [
    "rich-textarea",
    "rich-textarea .ql-editor",
    "rich-textarea [contenteditable='true']",
    "div.ql-editor",
    "div[contenteditable='true']",
    "div[role='textbox']",
    "div[aria-label*='prompt' i]",
    "div[aria-label*='Ask Gemini' i]",
    "textarea",
  ],
  mainSendButtons: [
    "button[aria-label*='Send' i]",
    "button[aria-label*='Submit' i]",
    "button.send-button",
    ".send-button-container button",
    "button:has(mat-icon)",
    "button[mat-icon-button]",
    "[role='button'][aria-label*='Send' i]",
    "[role='button'][aria-label*='Submit' i]",
  ],
} as const;

/**
 * Traverses activeElement all the way through open shadow roots.
 */
function getDeepActiveElement(): Element | null {
  let active: Element | null = document.activeElement;
  while (active && (active as HTMLElement).shadowRoot && (active as HTMLElement).shadowRoot?.activeElement) {
    active = (active as HTMLElement).shadowRoot!.activeElement;
  }
  return active;
}

/**
 * Finds the editable inner element of a <rich-textarea> (light or shadow DOM).
 */
function extractFromRichTextarea(rich: HTMLElement): HTMLElement {
  if (rich.shadowRoot) {
    const ql = rich.shadowRoot.querySelector<HTMLElement>(
      ".ql-editor, [contenteditable='true'], [role='textbox'], textarea"
    );
    if (ql) return ql;
  }
  const light = rich.querySelector<HTMLElement>(
    ".ql-editor, [contenteditable='true'], [role='textbox'], textarea"
  );
  if (light) return light;
  return rich;
}

/**
 * Searches the DOM and open shadow roots recursively for an element matching the predicate.
 */
function queryDeep(
  predicate: (el: HTMLElement) => boolean,
  root: Document | Element | ShadowRoot = document
): HTMLElement | null {
  if ("querySelectorAll" in root) {
    const elements = root.querySelectorAll<HTMLElement>("*");
    for (const el of Array.from(elements)) {
      if (predicate(el)) return el;
      if (el.shadowRoot) {
        const found = queryDeep(predicate, el.shadowRoot);
        if (found) return found;
      }
    }
  }
  return null;
}

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
    // 1. Deep active element if editable
    const deepActive = getDeepActiveElement();
    if (
      deepActive instanceof HTMLElement &&
      (deepActive.isContentEditable ||
        deepActive.tagName === "TEXTAREA" ||
        deepActive.classList.contains("ql-editor") ||
        deepActive.getAttribute("role") === "textbox")
    ) {
      return deepActive;
    }

    // 2. rich-textarea
    const rich = document.querySelector<HTMLElement>("rich-textarea");
    if (rich) {
      return extractFromRichTextarea(rich);
    }

    // 3. Fallback to main selectors
    for (const sel of GEMINI_SELECTORS.mainComposers) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) {
        return el.tagName === "RICH-TEXTAREA" ? extractFromRichTextarea(el) : el;
      }
    }

    // 4. Any contenteditable across shadow DOM
    const deepFound = queryDeep(
      (el) => el.isContentEditable || el.classList.contains("ql-editor") || el.tagName === "TEXTAREA"
    );
    if (deepFound) return deepFound;

    return null;
  }

  getSendButton(): HTMLElement | null {
    // 1. Standard selectors
    for (const sel of GEMINI_SELECTORS.mainSendButtons) {
      try {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      } catch {}
    }

    // 2. Deep query for send button
    return queryDeep((el) => {
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        const tip = (el.getAttribute("mattooltip") || "").toLowerCase();
        if (aria.includes("send") || aria.includes("submit") || tip.includes("send")) {
          return true;
        }
      }
      return false;
    });
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
        const matTooltip = (el.getAttribute("mattooltip") || "").toLowerCase();
        const title = (el.getAttribute("title") || "").toLowerCase();
        const testId = (el.getAttribute("data-test-id") || el.getAttribute("data-testid") || "").toLowerCase();

        if (
          ariaLabel.includes("send") ||
          ariaLabel.includes("submit") ||
          matTooltip.includes("send") ||
          matTooltip.includes("submit") ||
          title.includes("send") ||
          title.includes("submit") ||
          testId.includes("send")
        ) {
          if (
            el.tagName === "BUTTON" ||
            el.getAttribute("role") === "button" ||
            el.closest?.("button, [role='button']")
          ) {
            return true;
          }
        }

        if (
          el.classList.contains("send-button") ||
          el.classList.contains("send-button-container") ||
          el.closest?.(".send-button, .send-button-container")
        ) {
          return true;
        }

        if (
          el.getAttribute("data-mat-icon-name") === "send" ||
          el.querySelector?.("[data-mat-icon-name='send']")
        ) {
          return true;
        }

        for (const sel of GEMINI_SELECTORS.mainSendButtons) {
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

    // 1. If Enter or click was pressed inside an editable element in composedPath
    for (const node of path) {
      const isHtml =
        typeof HTMLElement !== "undefined"
          ? node instanceof HTMLElement
          : Boolean(node && (node as unknown as { tagName?: unknown }).tagName);

      if (isHtml) {
        const el = node as unknown as HTMLElement;
        if (
          el.isContentEditable ||
          el.classList?.contains("ql-editor") ||
          (typeof HTMLTextAreaElement !== "undefined" && el instanceof HTMLTextAreaElement) ||
          el.getAttribute?.("role") === "textbox"
        ) {
          return this.createContextForElement(el);
        }
        if (el.tagName === "RICH-TEXTAREA") {
          const inner = extractFromRichTextarea(el);
          return this.createContextForElement(inner);
        }
      }
    }

    // 2. Check deep activeElement
    const deepActive = getDeepActiveElement();
    if (
      deepActive instanceof HTMLElement &&
      (deepActive.isContentEditable ||
        deepActive instanceof HTMLTextAreaElement ||
        deepActive.classList.contains("ql-editor") ||
        deepActive.getAttribute("role") === "textbox")
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
        let target = element;
        if (target.tagName === "RICH-TEXTAREA") {
          target = extractFromRichTextarea(target);
        }

        if (target instanceof HTMLTextAreaElement) {
          const val = target.value.trim();
          if (val) return val;
        }

        const text = (target.innerText || target.textContent || "").trim();
        if (text) return text;

        // Fallback to global getText if the specific element was blank
        return this.getText();
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
    // 1. Deep active element
    const deepActive = getDeepActiveElement();
    if (deepActive instanceof HTMLElement) {
      if (deepActive instanceof HTMLTextAreaElement && deepActive.value.trim()) {
        return deepActive.value.trim();
      }
      if (
        (deepActive.isContentEditable ||
          deepActive.classList.contains("ql-editor") ||
          deepActive.getAttribute("role") === "textbox") &&
        deepActive.innerText?.trim()
      ) {
        return deepActive.innerText.trim();
      }
    }

    // 2. rich-textarea custom element
    const richElements = Array.from(document.querySelectorAll<HTMLElement>("rich-textarea"));
    for (const rich of richElements) {
      const inner = extractFromRichTextarea(rich);
      const val = inner instanceof HTMLTextAreaElement ? inner.value : inner.innerText || inner.textContent || "";
      if (val.trim()) return val.trim();
    }

    // 3. Fallback to main composer selectors in document
    for (const sel of GEMINI_SELECTORS.mainComposers) {
      try {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) {
          const inner = el.tagName === "RICH-TEXTAREA" ? extractFromRichTextarea(el) : el;
          const val = inner instanceof HTMLTextAreaElement ? inner.value : inner.innerText || inner.textContent || "";
          if (val.trim()) return val.trim();
        }
      } catch {}
    }

    // 4. Any contenteditable across shadow DOM
    const deepFound = queryDeep((el) => {
      if (el.isContentEditable || el.classList.contains("ql-editor") || el instanceof HTMLTextAreaElement) {
        const t = el instanceof HTMLTextAreaElement ? el.value : el.innerText || el.textContent || "";
        return Boolean(t && t.trim().length > 0);
      }
      return false;
    });

    if (deepFound) {
      const val =
        deepFound instanceof HTMLTextAreaElement
          ? deepFound.value
          : deepFound.innerText || deepFound.textContent || "";
      if (val.trim()) return val.trim();
    }

    return "";
  }

  setText(text: string): boolean {
    const composer = this.getComposer();
    if (composer) {
      return this.writeToElement(composer, text);
    }
    return false;
  }

  private writeToElement(element: HTMLElement, text: string): boolean {
    if (element.tagName === "RICH-TEXTAREA") {
      element = extractFromRichTextarea(element);
    }

    element.focus();

    if (element instanceof HTMLTextAreaElement) {
      element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return true;
    }

    // ContentEditable (Quill / standard)
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

      const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      element.innerHTML = `<p>${escaped}</p>`;
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
    return Boolean(
      document.querySelector("rich-textarea") ||
      this.getComposer() ||
      document.querySelector(".ql-editor, [contenteditable='true'], textarea")
    );
  }
}

export const geminiAdapter = new GeminiAdapter();
