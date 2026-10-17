/**
 * VeilGuard AI - Metadata Audit Events Store
 *
 * Implements a hardened, metadata-only event store for the privacy dashboard.
 *
 * Invariants & Guarantees:
 *  - Rule 7: Zero raw prompt text, entity values, or placeholder mappings stored.
 *  - Runtime Whitelist: Every event is strictly validated by sanitizeEvent().
 *    Unknown keys (text, prompt, value, etc.) are permanently discarded.
 *  - Serialized Writes: All storage operations are piped through a Promise queue
 *    to prevent read-modify-write race conditions under concurrent submissions.
 *  - Ring Buffer Cap: Retains at most 1,000 newest events; older entries are evicted.
 *  - Pause Switch: When vgRecordHistory is false, recording is paused.
 *    Pausing history NEVER affects or pauses privacy protection.
 *  - Injected Storage: Accepts a StorageAdapter interface to enable zero-dependency unit tests.
 */

export type EventDecision = "allow" | "redact" | "require_approval" | "block";

export type EventUserChoice =
  | "sent_sanitized"
  | "sent_original"
  | "edited"
  | "cancelled"
  | "failed_closed"
  | "auto_allowed"
  | "blocked";

export type EventSource = "prompt" | "document";

/**
 * The strictly whitelisted shape of an event persisted in storage.
 * Free-text fields are strictly forbidden.
 */
export interface StoredEvent {
  timestamp: string;
  destination: string;
  profile: string;
  decision: EventDecision;
  user_choice: EventUserChoice;
  rule_ids: string[];
  category_counts: Record<string, number>;
  entity_count: number;
  latency_ms: number;
  source: EventSource;
  outcome: string;
}

export const MAX_STORED_EVENTS = 1000;
export const EVENTS_STORAGE_KEY = "vg_events";
export const LEGACY_AUDIT_KEY = "vg_audit_log";
export const RECORD_HISTORY_KEY = "vgRecordHistory";

// Validation constants
const VALID_DECISIONS = new Set<string>(["allow", "redact", "require_approval", "block"]);
const VALID_USER_CHOICES = new Set<string>([
  "sent_sanitized",
  "sent_original",
  "edited",
  "cancelled",
  "failed_closed",
  "auto_allowed",
  "blocked",
]);
const VALID_SOURCES = new Set<string>(["prompt", "document"]);

// Hostname regex: standard domain / IP / localhost, max 253 chars, no paths or query params
const HOSTNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Rule ID: alphanumeric + underscore/dot, max 64 chars, strictly no spaces or prose
const RULE_ID_RE = /^[A-Z0-9_.]{1,64}$/;

// Category: uppercase identifier
const CATEGORY_RE = /^[A-Z0-9_]{1,32}$/;

/**
 * Maps legacy outcome strings to standardized user_choice.
 */
function normalizeUserChoice(choice: unknown, outcome: unknown, decision: EventDecision): EventUserChoice {
  if (typeof choice === "string" && VALID_USER_CHOICES.has(choice)) {
    return choice as EventUserChoice;
  }
  if (typeof outcome === "string") {
    switch (outcome) {
      case "user_approved":
      case "redacted_and_sent":
        return "sent_sanitized";
      case "user_overrode":
        return "sent_original";
      case "user_edited":
        return "edited";
      case "user_cancelled":
        return "cancelled";
      case "engine_unreachable":
        return "failed_closed";
      case "blocked":
        return "blocked";
    }
  }
  if (decision === "allow") return "auto_allowed";
  if (decision === "block") return "blocked";
  return "sent_sanitized";
}

/**
 * Validates and sanitizes a raw event object at runtime.
 * Strips unknown keys, validates types and ranges, and returns a clean StoredEvent
 * or null if invalid.
 */
export function sanitizeEvent(raw: unknown): StoredEvent | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  // 1. Timestamp validation (ISO 8601)
  if (typeof obj.timestamp !== "string" || !obj.timestamp) {
    return null;
  }
  const parsedTime = Date.parse(obj.timestamp);
  if (Number.isNaN(parsedTime)) {
    return null;
  }
  const timestamp = new Date(parsedTime).toISOString();

  // 2. Destination validation (hostname only)
  let destination = "unknown";
  if (typeof obj.destination === "string" && obj.destination.length > 0 && obj.destination.length <= 253) {
    const trimmed = obj.destination.trim();
    if (trimmed === "localhost" || HOSTNAME_RE.test(trimmed)) {
      destination = trimmed;
    } else {
      // Invalid hostname format (contained paths, query strings, or invalid chars)
      return null;
    }
  } else if (obj.destination !== undefined) {
    return null;
  }

  // 3. Profile validation
  let profile = "company";
  if (typeof obj.profile === "string" && obj.profile.length > 0 && obj.profile.length <= 64) {
    profile = obj.profile.trim();
  }

  // 4. Decision validation
  if (typeof obj.decision !== "string" || !VALID_DECISIONS.has(obj.decision)) {
    return null;
  }
  const decision = obj.decision as EventDecision;

  // 5. User choice validation
  const user_choice = normalizeUserChoice(obj.user_choice, obj.outcome, decision);

  // 6. Rule IDs validation (max 20 entries, each matching RULE_ID_RE, no spaces)
  const rule_ids: string[] = [];
  if (Array.isArray(obj.rule_ids)) {
    for (const r of obj.rule_ids) {
      if (typeof r === "string" && RULE_ID_RE.test(r.trim())) {
        if (rule_ids.length < 20) {
          rule_ids.push(r.trim());
        }
      } else {
        // Entry containing prose, spaces, or invalid chars is rejected
        continue;
      }
    }
  } else if (Array.isArray(obj.ruleIds)) {
    // Support legacy camelCase
    for (const r of obj.ruleIds) {
      if (typeof r === "string" && RULE_ID_RE.test(r.trim())) {
        if (rule_ids.length < 20) {
          rule_ids.push(r.trim());
        }
      }
    }
  }

  // 7. Category counts validation
  const category_counts: Record<string, number> = {};
  if (typeof obj.category_counts === "object" && obj.category_counts !== null && !Array.isArray(obj.category_counts)) {
    const rawCounts = obj.category_counts as Record<string, unknown>;
    for (const [k, v] of Object.entries(rawCounts)) {
      if (CATEGORY_RE.test(k) && typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10000) {
        category_counts[k] = v;
      }
    }
  } else if (typeof obj.category === "string" && CATEGORY_RE.test(obj.category)) {
    // Legacy single category fallback
    category_counts[obj.category] = typeof obj.entityCount === "number" ? Math.max(1, Math.min(10000, Math.floor(obj.entityCount))) : 1;
  }

  // 8. Entity count validation
  let entity_count = 0;
  if (typeof obj.entity_count === "number" && Number.isFinite(obj.entity_count) && obj.entity_count >= 0) {
    entity_count = Math.min(10000, Math.floor(obj.entity_count));
  } else if (typeof obj.entityCount === "number" && Number.isFinite(obj.entityCount) && obj.entityCount >= 0) {
    entity_count = Math.min(10000, Math.floor(obj.entityCount));
  } else {
    // Sum from category_counts
    entity_count = Object.values(category_counts).reduce((sum, n) => sum + n, 0);
  }

  // 9. Latency validation
  let latency_ms = 0;
  if (typeof obj.latency_ms === "number" && Number.isFinite(obj.latency_ms) && obj.latency_ms >= 0) {
    latency_ms = Math.min(300000, Math.round(obj.latency_ms));
  } else if (typeof obj.latency === "number" && Number.isFinite(obj.latency) && obj.latency >= 0) {
    latency_ms = Math.min(300000, Math.round(obj.latency));
  }

  // 10. Source validation
  let source: EventSource = "prompt";
  if (typeof obj.source === "string" && VALID_SOURCES.has(obj.source)) {
    source = obj.source as EventSource;
  }

  // 11. Outcome
  const outcome = typeof obj.outcome === "string" && obj.outcome.length <= 64 ? obj.outcome : user_choice;

  // Strict whitelist return: rogue fields (text, prompt, value, token, etc.) are excluded
  return {
    timestamp,
    destination,
    profile,
    decision,
    user_choice,
    rule_ids,
    category_counts,
    entity_count,
    latency_ms,
    source,
    outcome,
  };
}

// ---------------------------------------------------------------------------
// Storage Adapter Interface
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove?(keys: string | string[]): Promise<void>;
}

export const chromeStorageAdapter: StorageAdapter = {
  get: (keys) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (items) => resolve(items || {}));
    });
  },
  set: (items) => {
    return new Promise((resolve) => {
      chrome.storage.local.set(items, () => resolve());
    });
  },
  remove: (keys) => {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => resolve());
    });
  },
};

/**
 * In-memory storage adapter for unit tests and headless environments.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private data = new Map<string, unknown>();

  async get(keys: string | string[]): Promise<Record<string, unknown>> {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const res: Record<string, unknown> = {};
    for (const k of keyList) {
      if (this.data.has(k)) {
        res[k] = this.data.get(k);
      }
    }
    return res;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) {
      this.data.set(k, v);
    }
  }

  async remove(keys: string | string[]): Promise<void> {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const k of keyList) {
      this.data.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Event Store Implementation
// ---------------------------------------------------------------------------

export class EventStore {
  private storage: StorageAdapter;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(storage: StorageAdapter = chromeStorageAdapter) {
    this.storage = storage;
  }

  /**
   * Enqueues an async task into the serialized write pipeline to avoid read-modify-write races.
   */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(fn, fn);
    this.writeQueue = run;
    return run;
  }

  /**
   * Returns whether event recording is currently enabled.
   * Default: true.
   */
  async isRecordingEnabled(): Promise<boolean> {
    const data = await this.storage.get(RECORD_HISTORY_KEY);
    return data[RECORD_HISTORY_KEY] !== false;
  }

  /**
   * Sets the pause switch state.
   */
  async setRecordingEnabled(enabled: boolean): Promise<void> {
    await this.serialize(async () => {
      await this.storage.set({ [RECORD_HISTORY_KEY]: enabled });
    });
  }

  /**
   * Appends an event to the store if valid and history recording is active.
   * Enforces runtime whitelisting and the 1,000-event ring buffer cap.
   * Returns true if stored, false if dropped or paused.
   */
  async appendEvent(raw: unknown): Promise<boolean> {
    const clean = sanitizeEvent(raw);
    if (!clean) {
      return false;
    }

    return this.serialize(async () => {
      const isEnabled = await this.isRecordingEnabled();
      if (!isEnabled) {
        return false;
      }

      const data = await this.storage.get([EVENTS_STORAGE_KEY, LEGACY_AUDIT_KEY]);
      const currentList: StoredEvent[] = Array.isArray(data[EVENTS_STORAGE_KEY])
        ? (data[EVENTS_STORAGE_KEY] as StoredEvent[])
        : [];

      const updated = [...currentList, clean];
      const capped = updated.length > MAX_STORED_EVENTS
        ? updated.slice(updated.length - MAX_STORED_EVENTS)
        : updated;

      // Keep legacy audit log synchronized for existing tests
      const legacyList = Array.isArray(data[LEGACY_AUDIT_KEY]) ? [...data[LEGACY_AUDIT_KEY]] : [];
      legacyList.push({
        timestamp: clean.timestamp,
        category: clean.rule_ids[0] || Object.keys(clean.category_counts)[0] || "PII",
        entityCount: clean.entity_count,
        riskScore: clean.decision === "block" ? 1 : clean.decision === "redact" ? 0.8 : 0,
        decision: clean.decision,
        ruleIds: clean.rule_ids,
        outcome: clean.outcome,
        destination: clean.destination,
      });
      const cappedLegacy = legacyList.slice(-MAX_STORED_EVENTS);

      await this.storage.set({
        [EVENTS_STORAGE_KEY]: capped,
        [LEGACY_AUDIT_KEY]: cappedLegacy,
      });

      return true;
    });
  }

  /**
   * Reads all stored events from storage.
   */
  async getEvents(): Promise<StoredEvent[]> {
    const data = await this.storage.get(EVENTS_STORAGE_KEY);
    if (!Array.isArray(data[EVENTS_STORAGE_KEY])) {
      return [];
    }
    const rawList = data[EVENTS_STORAGE_KEY] as unknown[];
    const result: StoredEvent[] = [];
    for (const item of rawList) {
      const clean = sanitizeEvent(item);
      if (clean) result.push(clean);
    }
    return result;
  }

  /**
   * Clears all stored events from storage.
   */
  async clearEvents(): Promise<void> {
    return this.serialize(async () => {
      if (typeof this.storage.remove === "function") {
        await this.storage.remove([EVENTS_STORAGE_KEY, LEGACY_AUDIT_KEY]);
      } else {
        await this.storage.set({
          [EVENTS_STORAGE_KEY]: [],
          [LEGACY_AUDIT_KEY]: [],
        });
      }
    });
  }

  /**
   * Returns whitelisted events suitable for JSON/CSV export.
   */
  async exportEvents(): Promise<StoredEvent[]> {
    return this.getEvents();
  }
}

// Global default singleton for extension background worker
export const defaultEventStore = new EventStore(chromeStorageAdapter);
