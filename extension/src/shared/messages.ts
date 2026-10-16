/**
 * VeilGuard AI - Extension Message Protocol
 *
 * Defines the strictly-typed discriminated union for all chrome.runtime.sendMessage
 * communication between content scripts and the background service worker.
 *
 * Design decisions:
 *  - Discriminated union on `type` field enables exhaustive handling at each endpoint.
 *  - Sender validation: messages from unexpected senders are rejected (Rule 7).
 *  - Raw prompt text IS allowed in ANALYZE messages (needed for inspection), but
 *    response payloads NEVER echo raw text — only sanitized_text and metadata.
 *  - VAULT_* messages carry only placeholder metadata, never raw entity values
 *    that haven't been sanitized first.
 */

import type {
  EngineAnalyzeResponse,
  KnownPlaceholder,
  EngineHealthResponse,
} from "../background/engine-client";

// Re-export engine types for convenience in message consumers
export type {
  EngineAnalyzeResponse,
  EngineFinding,
  KnownPlaceholder,
  EngineHealthResponse,
  SanitizeVerification,
} from "../background/engine-client";

// ---------------------------------------------------------------------------
// Request message types (content script → background)
// ---------------------------------------------------------------------------

/** Request to analyze text via the engine. */
export interface AnalyzeRequest {
  type: "ANALYZE";
  /** Raw prompt text to inspect — sent to engine, never logged. */
  text: string;
  /** Hostname the prompt will be sent to (used for destination trust tier). */
  destination: string;
  /** Policy profile to apply (default: "company"). */
  profile?: string;
  /** Previously assigned placeholder mappings for multi-turn session consistency. */
  knownPlaceholders?: KnownPlaceholder[];
}

/** Request to ping the engine health endpoint. */
export interface PingRequest {
  type: "PING";
}

/** Request to fetch available policy profiles from the engine. */
export interface FetchProfilesRequest {
  type: "FETCH_PROFILES";
}

/** Request to record a metadata audit event (no raw text, only classification metadata). */
export interface RecordEventRequest {
  type: "RECORD_EVENT";
  event: AuditEventMetadata;
}

/** Request to get the current session vault entries for a tab. */
export interface VaultGetRequest {
  type: "VAULT_GET";
  tabId: number;
}

/** Request to merge new placeholder mappings into the session vault for a tab. */
export interface VaultMergeRequest {
  type: "VAULT_MERGE";
  tabId: number;
  placeholders: KnownPlaceholder[];
}

/** Request to clear the session vault for a tab. */
export interface VaultClearRequest {
  type: "VAULT_CLEAR";
  tabId: number;
}

/** Union of all request types. */
export type VeilGuardRequest =
  | AnalyzeRequest
  | PingRequest
  | FetchProfilesRequest
  | RecordEventRequest
  | VaultGetRequest
  | VaultMergeRequest
  | VaultClearRequest;

// ---------------------------------------------------------------------------
// Response message types (background → content script)
// ---------------------------------------------------------------------------

/** Successful analysis result. */
export interface AnalyzeSuccess {
  ok: true;
  result: EngineAnalyzeResponse;
}

/** Failed analysis — engine unreachable, auth error, or parse error. */
export interface AnalyzeFailure {
  ok: false;
  errorKind: string;
  errorMessage: string;
}

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;

/** Ping response. */
export interface PingSuccess {
  ok: true;
  health: EngineHealthResponse;
}
export interface PingFailure {
  ok: false;
  errorKind: string;
  errorMessage: string;
}
export type PingResponse = PingSuccess | PingFailure;

/** Profiles response. */
export interface ProfilesSuccess {
  ok: true;
  profiles: string[];
}
export interface ProfilesFailure {
  ok: false;
  errorKind: string;
  errorMessage: string;
}
export type ProfilesResponse = ProfilesSuccess | ProfilesFailure;

/** Vault GET response. */
export interface VaultGetResponse {
  ok: true;
  placeholders: KnownPlaceholder[];
}

/** Generic ACK for fire-and-forget operations (RECORD_EVENT, VAULT_MERGE, VAULT_CLEAR). */
export interface AckResponse {
  ok: true;
}

// ---------------------------------------------------------------------------
// Audit event metadata (Rule 7 — never raw prompt text)
// ---------------------------------------------------------------------------

/**
 * Metadata-only audit event. Raw prompt content MUST NEVER be included.
 * Stored in chrome.storage.local ring buffer (max 200 entries).
 */
export interface AuditEventMetadata {
  /** ISO 8601 timestamp of the event. */
  timestamp: string;
  /** Classification category (e.g. "PII_COMBINATION_PERSON", "SECRETS"). */
  category: string;
  /** Number of sensitive entities detected. */
  entityCount: number;
  /** Risk score from the engine (0–1). */
  riskScore: number;
  /** Policy decision applied. */
  decision: "allow" | "redact" | "require_approval" | "block";
  /** The rule ID(s) that triggered this decision. */
  ruleIds: string[];
  /** Submission outcome: blocked, redacted and sent, approved by user, etc. */
  outcome:
    | "blocked"
    | "redacted_and_sent"
    | "user_approved"
    | "user_edited"
    | "user_cancelled"
    | "user_overrode"
    | "engine_unreachable";
  /** Hostname of the destination AI site (no path, no query string). */
  destination: string;
}

// ---------------------------------------------------------------------------
// Type guard helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a value conforms to VeilGuardRequest shape.
 * Used by the background message listener for sender validation.
 */
export function isVeilGuardRequest(value: unknown): value is VeilGuardRequest {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  const validTypes = new Set<string>([
    "ANALYZE",
    "PING",
    "FETCH_PROFILES",
    "RECORD_EVENT",
    "VAULT_GET",
    "VAULT_MERGE",
    "VAULT_CLEAR",
  ]);
  return typeof obj["type"] === "string" && validTypes.has(obj["type"]);
}
