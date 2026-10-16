/**
 * Interface and configuration types for site-specific AI interface adapters.
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
   * Note: Must NEVER cache element references to handle SPA re-renders.
   */
  getComposer(): HTMLElement | null;

  /**
   * Extracts text from the active composer.
   */
  getText(): string;

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
   * Verifies that the required interface elements are present in the DOM.
   * Resolves true if elements exist, false if timed out.
   */
  selfTest(timeoutMs?: number): Promise<boolean>;
}
