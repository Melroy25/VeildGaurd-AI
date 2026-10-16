/**
 * VeilGuard AI - Session Vault
 *
 * Manages per-tab pseudonymization placeholder mappings across conversation
 * turns using chrome.storage.session (ephemeral, cleared on browser restart).
 *
 * Design: Engine is stateless; the browser extension maintains the mapping vault
 * and seeds it back into each /analyze call so entity placeholder consistency is
 * maintained across turns (Decision 19).
 *
 * Rule 7: Raw prompt text is NEVER written to this vault. Only entity_type,
 * sanitized placeholder string, and the (already-detected) entity value are stored.
 * The entity value is needed to reseed the engine for multi-turn consistency.
 */

import type { KnownPlaceholder } from "../shared/messages";

/** Storage key prefix for vault entries in chrome.storage.session. */
const VAULT_KEY_PREFIX = "vg_vault_";

function vaultKey(tabId: number): string {
  return `${VAULT_KEY_PREFIX}${tabId}`;
}

/**
 * Retrieves all known placeholder mappings for a given tab.
 * Returns an empty array if no vault exists for this tab.
 */
export async function vaultGet(tabId: number): Promise<KnownPlaceholder[]> {
  const key = vaultKey(tabId);
  const result = await chrome.storage.session.get(key);
  const entries = result[key];
  if (Array.isArray(entries)) {
    return entries as KnownPlaceholder[];
  }
  return [];
}

/**
 * Merges new placeholder mappings into the existing vault for a tab.
 * Existing entries are preserved; new entries are appended if not already
 * present (matched by entity_type + value pair).
 */
export async function vaultMerge(tabId: number, newPlaceholders: KnownPlaceholder[]): Promise<void> {
  const existing = await vaultGet(tabId);

  // Build a deduplication map keyed by "entity_type|value"
  const seen = new Map<string, KnownPlaceholder>();
  for (const p of existing) {
    seen.set(`${p.entity_type}|${p.value}`, p);
  }
  for (const p of newPlaceholders) {
    const key = `${p.entity_type}|${p.value}`;
    if (!seen.has(key)) {
      seen.set(key, p);
    }
  }

  const merged = Array.from(seen.values());
  await chrome.storage.session.set({ [vaultKey(tabId)]: merged });
}

/**
 * Clears the vault for a specific tab. Called when a tab closes or the
 * user explicitly clears the session via the options page.
 */
export async function vaultClear(tabId: number): Promise<void> {
  await chrome.storage.session.remove(vaultKey(tabId));
}
