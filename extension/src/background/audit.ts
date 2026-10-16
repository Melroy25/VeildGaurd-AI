/**
 * VeilGuard AI - Audit Event Ring Buffer
 *
 * Stores metadata-only audit events in chrome.storage.local.
 * Maximum ring buffer size is 200 entries; oldest events are evicted
 * when the buffer is full.
 *
 * Rule 7: ONLY metadata is stored. Raw prompt text, sanitized_text, or
 * any form of original entity value must NEVER be written here.
 */

import type { AuditEventMetadata } from "../shared/messages";

const AUDIT_KEY = "vg_audit_log";
const MAX_AUDIT_ENTRIES = 200;

/**
 * Appends an audit event to the ring buffer in chrome.storage.local.
 * If the buffer exceeds MAX_AUDIT_ENTRIES, the oldest entry is dropped.
 */
export async function recordAuditEvent(event: AuditEventMetadata): Promise<void> {
  const result = await chrome.storage.local.get(AUDIT_KEY);
  const existing: AuditEventMetadata[] = Array.isArray(result[AUDIT_KEY])
    ? (result[AUDIT_KEY] as AuditEventMetadata[])
    : [];

  const updated = [...existing, event];

  // Evict oldest when buffer full
  const trimmed = updated.length > MAX_AUDIT_ENTRIES
    ? updated.slice(updated.length - MAX_AUDIT_ENTRIES)
    : updated;

  await chrome.storage.local.set({ [AUDIT_KEY]: trimmed });
}

/**
 * Reads all stored audit events (newest last).
 * Used by the options/dashboard page to display the audit log.
 */
export async function getAuditEvents(): Promise<AuditEventMetadata[]> {
  const result = await chrome.storage.local.get(AUDIT_KEY);
  return Array.isArray(result[AUDIT_KEY])
    ? (result[AUDIT_KEY] as AuditEventMetadata[])
    : [];
}

/**
 * Clears the entire audit log. Called from options page.
 */
export async function clearAuditLog(): Promise<void> {
  await chrome.storage.local.remove(AUDIT_KEY);
}
