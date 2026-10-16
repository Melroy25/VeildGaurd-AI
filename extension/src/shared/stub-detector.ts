/**
 * STUB: not real detection. It exists only so enforcement can be tested.
 * Replaced by engine calls in Phase 3.
 *
 * Checks for a 10-digit Indian mobile-style number pattern.
 */

const STUB_SENSITIVE_PHONE_REGEX = /\b[6-9]\d{9}\b/;

export function isFlagged(text: string): boolean {
  if (!text) return false;
  return STUB_SENSITIVE_PHONE_REGEX.test(text);
}
