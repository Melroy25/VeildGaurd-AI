/**
 * Interface and configuration types for site-specific AI interface adapters.
 * Rule 15: All site-specific DOM details reside here, not scattered across content scripts.
 */

export interface AdapterSelectorConfig {
  readonly textareaComposer: string;
  readonly contenteditableComposer: string;
  readonly sendButton: string;
  readonly form?: string;
  readonly programmaticButton?: string;
}

export interface SiteAdapter {
  readonly id: string;
  readonly selectors: AdapterSelectorConfig;

  /**
   * Evaluates if this adapter handles the current browser URL location.
   */
  matches(location: Location): boolean;

  /**
   * Locates the active composer element (textarea or contenteditable).
   * Must NEVER cache element references to handle SPA re-renders.
   */
  getComposer(): HTMLElement | null;

  /**
   * Extracts text from the active composer.
   */
  getText(): string;

  /**
   * Programmatically sets text in the active composer, then fires a
   * bubbling "input" event so that React controlled components (or the
   * mock-site controlled state mode) pick up the new value.
   *
   * For textarea: uses the native HTMLInputElement descriptor setter +
   * bubbling InputEvent to bypass React's synthetic value tracking.
   *
   * For contenteditable: uses execCommand("insertText") first (with
   * selection-all + delete prefix) to fire compositionend-compatible events,
   * then falls back to direct textContent + input event dispatch.
   *
   * After setting, calls verifyText() to confirm the composer reflects
   * the expected value.
   *
   * Returns true when text was verified to have been set; false on failure.
   */
  setText(text: string): boolean;

  /**
   * Locates the submit or send button.
   */
  getSendButton(): HTMLElement | null;

  /**
   * Checks if an event target or element is or is contained within the send button.
   */
  isSendButton(target: EventTarget | null): boolean;

  /**
   * Locates the enclosing form element if wired via form submit.
   */
  getForm(): HTMLFormElement | null;

  /**
   * Programmatically triggers a send, simulating the appropriate submission
   * path (form submit, button click, or Enter keydown depending on wiring).
   *
   * Used by the review overlay's "Send Sanitized" path after user approval.
   */
  triggerSend(): void;

  /**
   * Verifies that the required interface elements are present in the DOM.
   * Resolves true if elements exist, false if timed out.
   */
  selfTest(timeoutMs?: number): Promise<boolean>;
}
