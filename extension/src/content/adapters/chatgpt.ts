/**
 * VeilGuard AI - Target AI Site Adapter: ChatGPT (https://chatgpt.com)
 *
 * Implements context-based event resolution for ChatGPT's multi-composer
 * interface (main prompt editor + inline message editing).
 *
 * Governing Rules:
 *  - Rule 15: Centralized adapter selector configuration.
 *  - Rule 7: Only metadata (matched selector name, element type) is logged, never page content.
 *  - Rule 14: Deterministic core DOM inspection and normalization.
 *
 * Verified DOM Date: 2026-10-17
 */

import type { SiteAdapter, AdapterSelectorConfig, ComposerContext } from "./types";

// ---------------------------------------------------------------------------
// Centralized Priority-Ordered Selector Lists (Rule 15)
// ---------------------------------------------------------------------------

export const CHATGPT_SELECTORS = {
  // Main prompt composers: Test IDs and stable IDs first, then roles, then structural classes
  mainComposers: [
    "#prompt-textarea",
    "#mobile-composer-prompt",
    "textarea[placeholder='Ask ChatGPT']",
    "textarea[aria-label='Chat with ChatGPT']",
    "[data-testid='prompt-textarea']",
    "div.ProseMirror#prompt-textarea",
    "div.ProseMirror[contenteditable='true']",
    "textarea#prompt-textarea",
    "textarea[data-testid='prompt-textarea']",
    "textarea",
  ],

  // Main send buttons: Test IDs first, then ARIA labels, then fallback IDs
  mainSendButtons: [
    "button[data-testid='send-button']",
    "#composer-submit-button",
    "button[aria-label='Send prompt']",
    "button[aria-label='Send message']",
    "button[aria-label*='Send']",
    "button[data-testid*='send']",
    "button[data-testid='composer-submit-button']",
    "button[type='submit']",
  ],

  // Secondary (edit message) turn container and buttons
  editTurnContainers: [
    "[data-message-author-role='user']",
    ".group\\/conversation-turn",
    "[data-testid*='user-message']",
  ],

  editComposers: [
    "div.ProseMirror[contenteditable='true']",
    "textarea",
  ],

  editSendButtons: [
    "button[data-testid='edit-submit-button']",
    "button[data-testid='save-and-submit-button']",
    "button.btn-primary",
  ],

  // File attachments and upload controls
  attachmentButtons: [
    "button[data-testid='composer-plus-btn']",
    "button[data-testid='attach-button']",
    "button[aria-label*='Attach']",
    "button[aria-label*='Upload']",
  ],

  fileInputs: [
    "input[type='file']",
  ],
} as const;

// ---------------------------------------------------------------------------
// Normalization Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes text for comparing editor contents before and after setText().
 * Trims whitespace, standardizes Windows \r\n to \n, and collapses runs of blank lines.
 */
export function normalizeForCompare(text: string): string {
  if (!text) return "";
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Normalizes text for comparing outbound backstop request payloads against approved text.
 * Collapses all whitespace sequences (spaces, tabs, newlines) to a single space and trims.
 * Prevents minor whitespace variations between DOM serialization and JSON encoding
 * from triggering false-positive blocks.
 */
export function normalizeForApproval(text: string): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// ChatGPT Site Adapter Implementation
// ---------------------------------------------------------------------------

export class ChatGPTAdapter implements SiteAdapter {
  readonly id = "chatgpt";
  readonly selectors: AdapterSelectorConfig = {
    textareaComposer: CHATGPT_SELECTORS.mainComposers[0],
    contenteditableComposer: CHATGPT_SELECTORS.mainComposers[0],
    sendButton: CHATGPT_SELECTORS.mainSendButtons[0],
  };

  /**
   * Outbound chat endpoints for ChatGPT.
   * Matches authenticated `/backend-api/conversation`,
   * anonymous `/backend-anon/conversation`, and unauth `/unauth-mweb/conversation`.
   */
  readonly chatEndpoint = /https?:\/\/[^/]+\/(backend-api|backend-anon|unauth-mweb)\/conversation/;

  /** Tracks the last matched selector for observability/diagnostics (metadata only). */
  private lastMatchedSelector: string | null = null;

  getLastMatchedSelector(): string | null {
    return this.lastMatchedSelector;
  }

  matches(location: Location): boolean {
    const host = location.hostname.toLowerCase();
    return host === "chatgpt.com" || host.endsWith(".chatgpt.com");
  }

  // -------------------------------------------------------------------------
  // Dynamic Element Queries (Rule 15: Never cache across events)
  // -------------------------------------------------------------------------

  private queryFirst<T extends Element>(selectors: readonly string[], root: Element | Document = document): { el: T; selector: string } | null {
    for (const sel of selectors) {
      const el = root.querySelector<T>(sel);
      if (el) {
        return { el, selector: sel };
      }
    }
    return null;
  }

  getComposer(): HTMLElement | null {
    const match = this.queryFirst<HTMLElement>(CHATGPT_SELECTORS.mainComposers);
    if (match) {
      this.lastMatchedSelector = match.selector;
      return match.el;
    }
    return null;
  }

  getSendButton(): HTMLElement | null {
    const match = this.queryFirst<HTMLElement>(CHATGPT_SELECTORS.mainSendButtons);
    if (match) {
      return match.el;
    }
    return null;
  }

  isSendButton(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;

    // Check main send button selectors
    for (const sel of CHATGPT_SELECTORS.mainSendButtons) {
      if (target.closest(sel)) return true;
    }

    // Check edit send button selectors
    for (const sel of CHATGPT_SELECTORS.editSendButtons) {
      if (target.closest(sel)) return true;
    }

    return false;
  }

  getForm(): HTMLFormElement | null {
    const composer = this.getComposer();
    return composer ? composer.closest("form") : null;
  }

  // -------------------------------------------------------------------------
  // Event-Context Resolution (Phase 4 Event-Time Resolution)
  // -------------------------------------------------------------------------

  /**
   * Resolves a ComposerContext at event time from the event target using closest().
   * Distinguishes between the main prompt composer and secondary message editing.
   */
  resolveContext(event: Event): ComposerContext | null {
    const target = event.target as Node | null;
    if (!target || !(target instanceof Element)) {
      // Fallback for document/window events targeting the main composer
      return this.createMainContext();
    }

    // 1. Check if the event occurs within an inline message edit turn
    for (const containerSel of CHATGPT_SELECTORS.editTurnContainers) {
      const turnContainer: Element | null = target.closest(containerSel);
      if (turnContainer) {
        const editComposerMatch: { el: HTMLElement; selector: string } | null =
          this.queryFirst<HTMLElement>(CHATGPT_SELECTORS.editComposers, turnContainer);
        const editSendMatch: { el: HTMLElement; selector: string } | null =
          this.queryFirst<HTMLElement>(CHATGPT_SELECTORS.editSendButtons, turnContainer);

        const isInsideEditComposer = Boolean(
          editComposerMatch && (editComposerMatch.el === target || editComposerMatch.el.contains(target))
        );
        const isInsideEditSend = Boolean(
          editSendMatch && (editSendMatch.el === target || editSendMatch.el.contains(target))
        );

        if (isInsideEditComposer || isInsideEditSend) {
          return this.createEditContext(turnContainer, editComposerMatch?.el ?? null, editSendMatch?.el ?? null);
        }
      }
    }

    // 2. Check if the event occurs within the main composer area or main send button
    const mainComposer = this.getComposer();
    const mainSend = this.getSendButton();
    const mainForm = this.getForm();

    const isInsideMainComposer = Boolean(mainComposer && (mainComposer === target || mainComposer.contains(target)));
    const isInsideMainSend = Boolean(mainSend && (mainSend === target || mainSend.contains(target)));
    const isInsideMainForm = Boolean(mainForm && (mainForm === target || mainForm.contains(target)));

    if (isInsideMainComposer || isInsideMainSend || isInsideMainForm) {
      return this.createMainContext();
    }

    // 3. Resilient fallback: Any contenteditable or textarea on ChatGPT is treated as composer
    const editable = target.closest<HTMLElement>('[contenteditable="true"], textarea');
    if (editable) {
      return {
        kind: "main",
        getText: () => {
          if (editable instanceof HTMLTextAreaElement) return editable.value;
          return normalizeForCompare(editable.innerText || editable.textContent || "");
        },
        setText: (text: string) => this.writeToElement(editable, text),
        triggerSend: () => this.triggerSend(),
      };
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

  private createEditContext(
    _turnContainer: Element,
    editComposer: HTMLElement | null,
    editSend: HTMLElement | null
  ): ComposerContext {
    return {
      kind: "edit",
      getText: () => {
        if (!editComposer) return "";
        if (editComposer instanceof HTMLTextAreaElement) {
          return editComposer.value;
        }
        return normalizeForCompare(editComposer.innerText || editComposer.textContent || "");
      },
      setText: (text: string) => {
        if (!editComposer) return false;
        return this.writeToElement(editComposer, text);
      },
      triggerSend: () => {
        if (editSend) {
          editSend.click();
        } else if (editComposer) {
          // If no distinct send button, dispatch Enter keydown
          editComposer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        }
      },
    };
  }

  // -------------------------------------------------------------------------
  // Text Reading & Writing
  // -------------------------------------------------------------------------

  getText(): string {
    const composer = this.getComposer();
    if (!composer) return "";

    if (composer instanceof HTMLTextAreaElement) {
      return composer.value;
    }

    // For ProseMirror contenteditable
    return normalizeForCompare(composer.innerText || composer.textContent || "");
  }

  setText(text: string): boolean {
    const composer = this.getComposer();
    if (!composer) return false;
    return this.writeToElement(composer, text);
  }

  /**
   * Sets text into an editor element (textarea or ProseMirror contenteditable)
   * and verifies the value after setting.
   */
  private writeToElement(element: HTMLElement, text: string): boolean {
    if (element instanceof HTMLTextAreaElement) {
      element.focus();
      // Reset React internal valueTracker so React onChange/onInput detects the update
      const tracker = (element as unknown as { _valueTracker?: { setValue(v: string): void } })._valueTracker;
      if (tracker) {
        tracker.setValue("");
      }

      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(element, text);
      } else {
        element.value = text;
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
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return normalizeForCompare(element.value) === normalizeForCompare(text);
    }

    // ProseMirror rich-text / contenteditable editor
    element.focus();

    // Select all existing contents
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Attempt standard execCommand insertText
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      // Fallback: dispatch synthetic beforeinput event
      try {
        const inputEvent = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: text,
        });
        element.dispatchEvent(inputEvent);
      } catch {
        // Fallback: direct textContent assignment
        element.textContent = text;
      }
    }

    // Dispatch required input and change events for ProseMirror state update
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    // Post-condition check: verify text was accepted
    const actual = normalizeForCompare(element.innerText || element.textContent || "");
    const expected = normalizeForCompare(text);
    return actual === expected;
  }

  // -------------------------------------------------------------------------
  // Submission Triggering
  // -------------------------------------------------------------------------

  triggerSend(): void {
    const btn = this.getSendButton();
    if (btn && !(btn as HTMLButtonElement).disabled) {
      btn.click();
      return;
    }

    // Fallback: dispatch Enter keydown on the composer
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

    if (btn) {
      btn.click();
    }
  }

  // -------------------------------------------------------------------------
  // Request Payload Body Extraction (Layer 2 Backstop)
  // -------------------------------------------------------------------------

  /**
   * Extracts the user prompt string from ChatGPT's outbound request body.
   * Handles string bodies, Request clones, Blob/ArrayBuffer, and fails closed on streams.
   */
  async extractUserText(body: unknown): Promise<string | null> {
    if (!body) return null;

    // Reject unreadable streaming bodies (Fail Closed per Rule 6 and Phase 4 spec)
    if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
      return null;
    }

    let rawJson: string | null = null;

    if (typeof body === "string") {
      rawJson = body;
    } else if (typeof Request !== "undefined" && body instanceof Request) {
      try {
        const clone = body.clone();
        rawJson = await clone.text();
      } catch {
        return null;
      }
    } else if (typeof Blob !== "undefined" && body instanceof Blob) {
      try {
        rawJson = await body.text();
      } catch {
        return null;
      }
    } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      try {
        const decoder = new TextDecoder("utf-8");
        rawJson = decoder.decode(body);
      } catch {
        return null;
      }
    }

    if (!rawJson) return null;

    try {
      const parsed = JSON.parse(rawJson);
      // ChatGPT schema: messages[0].content.parts
      if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
        const firstMsg = parsed.messages[0];
        if (firstMsg?.content?.parts && Array.isArray(firstMsg.content.parts)) {
          const parts = firstMsg.content.parts
            .filter((p: unknown) => typeof p === "string")
            .join("\n");
          if (parts) return parts;
        }
      }

      // Alternative legacy schema
      if (typeof parsed.prompt === "string") return parsed.prompt;
      if (typeof parsed.message === "string") return parsed.message;
      if (typeof parsed.text === "string") return parsed.text;

      return null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Self-Test & SPA Resilience
  // -------------------------------------------------------------------------

  async selfTest(timeoutMs: number = 3000): Promise<boolean> {
    // On ChatGPT, the send button is dynamically hidden when the composer is empty.
    // As long as the composer textarea/contenteditable exists, DOM protection is active.
    if (this.getComposer()) {
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

export const chatgptAdapter = new ChatGPTAdapter();
