/**
 * Interface and configuration types for site-specific AI interface adapters.
 * Rule 15: All site-specific DOM details reside here, not scattered across content scripts.
 */

export interface AdapterSelectorConfig {
  readonly textareaComposer?: string;
  readonly contenteditableComposer?: string;
  readonly sendButton?: string;
  readonly form?: string;
  readonly programmaticButton?: string;
  readonly [key: string]: string | string[] | undefined;
}

export type ComposerKind = "main" | "edit";

/**
 * Event-time context resolved from a submission event.
 * Represents the specific composer (main prompt area or an inline message edit)
 * and its dedicated actions. Never cached across events.
 */
export interface ComposerContext {
  readonly kind: ComposerKind;
  getText(): string;
  setText(text: string): boolean;
  triggerSend(): void;
}

export interface SiteAdapter {
  readonly id: string;
  readonly selectors: AdapterSelectorConfig;
  readonly chatEndpoint?: RegExp | string;

  /**
   * Evaluates if this adapter handles the current browser URL location.
   */
  matches(location: Location): boolean;

  /**
   * Resolves a ComposerContext at event time from the event target using closest().
   * Returns null if the event does not target a recognized composer or send button.
   */
  resolveContext(event: Event): ComposerContext | null;

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
   * Programmatically triggers a send, simulating the appropriate submission path.
   */
  triggerSend(): void;

  /**
   * Verifies that the required interface elements are present in the DOM.
   * Resolves true if elements exist, false if timed out.
   */
  selfTest(timeoutMs?: number): Promise<boolean>;

  /**
   * Normalizes text for comparing composer contents before/after setText.
   * Collapses runs of blank lines, normalizes \r\n to \n, and trims.
   */
  normalizeForCompare?(text: string): string;

  /**
   * Normalizes text for comparing backstop outbound text against approved text.
   * Collapses all whitespace sequences to single space and trims.
   */
  normalizeForApproval?(text: string): string;

  /**
   * Extracts the user prompt string from an outbound chat request payload body.
   * Returns null if the body is unparseable or cannot be extracted.
   */
  extractUserText?(body: unknown): Promise<string | null> | string | null;
}
