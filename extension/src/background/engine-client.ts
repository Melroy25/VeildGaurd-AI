/**
 * VeilGuard AI - Engine Client (Background Service Worker)
 *
 * Handles all network communication with the local Python privacy engine
 * running at http://127.0.0.1:8765. This module runs ONLY in the background
 * service worker context.
 *
 * Security invariants:
 *  - Loopback only: ENGINE_BASE_URL is hardcoded to 127.0.0.1:8765 (Rule 5).
 *  - Token is never exposed to content scripts or page DOM (Rules 7, 9).
 *  - Fail closed: all fetch errors result in a typed EngineError that callers
 *    must handle by blocking the submission (Rule 6).
 *  - Raw prompt text is passed through but never logged by this module (Rule 7).
 */

/** The loopback base URL — never change to 0.0.0.0 or any external host. */
const ENGINE_BASE_URL = "http://127.0.0.1:8765";

/** Network timeout for all engine calls, in milliseconds. */
const ENGINE_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

/** A single detected entity finding from the engine. */
export interface EngineFinding {
  id: string;
  entity_type: string;
  value: string;
  start: number;
  end: number;
  score: number;
  detector: string;
  action: string;
  placeholder?: string;
}

/** Per-finding verification entry from the re-scan phase. */
export interface EngineResidualFinding {
  entity_type: string;
  value: string;
  start: number;
  end: number;
}

/** Sanitization verification block. */
export interface SanitizeVerification {
  residual_count: number;
  residual_findings: EngineResidualFinding[];
}

/** Known placeholder to seed into the engine for multi-turn sessions. */
export interface KnownPlaceholder {
  entity_type: string;
  value: string;
  placeholder: string;
}

/** Full /analyze response from the engine. */
export interface EngineAnalyzeResponse {
  decision: "allow" | "redact" | "require_approval" | "block";
  sanitized_text: string;
  findings: EngineFinding[];
  summary: string;
  primary_rule_id: string | null;
  matched_rule_ids: string[];
  may_change_result: boolean;
  offset_unit: "utf16";
  verification: SanitizeVerification;
}

/** /health response fields we care about. */
export interface EngineHealthResponse {
  status: string;
  version?: string;
}

/** /analyze/profiles response. */
export interface EngineProfilesResponse {
  profiles: string[];
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type EngineErrorKind =
  | "unreachable"    // fetch() threw — engine not running or CORS failure
  | "timeout"        // AbortController fired
  | "auth_error"     // 401 from engine — token invalid / missing
  | "engine_error"   // 4xx / 5xx other than 401
  | "parse_error";   // unexpected response body shape

export class EngineError extends Error {
  constructor(
    public readonly kind: EngineErrorKind,
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "EngineError";
  }
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/**
 * Retrieves the bearer token from chrome.storage.local.
 * Token is stored under key "vg_token" by the options page.
 * Returns null when no token is configured.
 */
export async function getStoredToken(): Promise<string | null> {
  const result = await chrome.storage.local.get("vg_token");
  const token = result["vg_token"];
  if (typeof token === "string" && token.length > 0) {
    return token;
  }
  return null;
}

/**
 * Saves the bearer token to chrome.storage.local.
 * Called by the options page after user enters / updates the token.
 */
export async function saveToken(token: string): Promise<void> {
  await chrome.storage.local.set({ vg_token: token });
}

/**
 * Clears the stored bearer token.
 */
export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove("vg_token");
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

/**
 * Performs a fetch to the local engine with timeout and auth header.
 * Throws EngineError on any failure — callers must catch and fail closed.
 *
 * The token is injected here — it is never sent to any URL other than the
 * hardcoded ENGINE_BASE_URL (Rule 8 — zero external telemetry with user content).
 */
async function engineFetch(
  path: string,
  options: RequestInit,
  token: string | null
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENGINE_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: chrome.runtime.getURL(""),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${ENGINE_BASE_URL}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers ?? {}) },
      signal: controller.signal,
    });
    return response;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new EngineError("timeout", `Engine request timed out after ${ENGINE_TIMEOUT_MS}ms`);
    }
    throw new EngineError(
      "unreachable",
      `Engine unreachable: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sends text to the engine /analyze endpoint.
 *
 * @param text          The raw prompt text to analyze.
 * @param destination   Hostname of the destination AI site (for policy trust tier).
 * @param profile       Policy profile ID to apply (default: "company").
 * @param knownPlaceholders Previously assigned placeholder mappings for this session.
 * @returns Resolved EngineAnalyzeResponse on success.
 * @throws EngineError on any failure — caller MUST fail closed.
 */
export async function analyze(
  text: string,
  destination: string,
  profile = "company",
  knownPlaceholders: KnownPlaceholder[] = []
): Promise<EngineAnalyzeResponse> {
  const token = await getStoredToken();

  const body = JSON.stringify({
    text,
    destination,
    profile,
    known_placeholders: knownPlaceholders,
  });

  const response = await engineFetch("/analyze", { method: "POST", body }, token);

  if (response.status === 401) {
    throw new EngineError("auth_error", "Engine rejected token (401). Check VeilGuard options.", 401);
  }
  if (!response.ok) {
    throw new EngineError(
      "engine_error",
      `Engine returned HTTP ${response.status}`,
      response.status
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new EngineError("parse_error", "Engine response was not valid JSON");
  }

  // Minimal shape validation — we trust the engine's Pydantic serialization
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as Record<string, unknown>)["decision"] !== "string"
  ) {
    throw new EngineError("parse_error", "Engine response missing required 'decision' field");
  }

  return data as EngineAnalyzeResponse;
}

/**
 * Pings the engine /health endpoint.
 * Returns the health payload on success, throws EngineError on failure.
 */
export async function ping(): Promise<EngineHealthResponse> {
  const token = await getStoredToken();
  const response = await engineFetch("/health", { method: "GET" }, token);

  if (response.status === 401) {
    throw new EngineError("auth_error", "Engine rejected token during ping (401).", 401);
  }
  if (!response.ok) {
    throw new EngineError("engine_error", `Engine ping returned HTTP ${response.status}`, response.status);
  }

  try {
    return (await response.json()) as EngineHealthResponse;
  } catch {
    throw new EngineError("parse_error", "Engine health response was not valid JSON");
  }
}

/**
 * Fetches the list of available policy profiles from the engine.
 * Used by the options page to populate the profile dropdown.
 */
export async function fetchProfiles(): Promise<EngineProfilesResponse> {
  const token = await getStoredToken();
  const response = await engineFetch("/analyze/profiles", { method: "GET" }, token);

  if (response.status === 401) {
    throw new EngineError("auth_error", "Engine rejected token fetching profiles (401).", 401);
  }
  if (!response.ok) {
    throw new EngineError("engine_error", `Engine profiles returned HTTP ${response.status}`, response.status);
  }

  try {
    return (await response.json()) as EngineProfilesResponse;
  } catch {
    throw new EngineError("parse_error", "Engine profiles response was not valid JSON");
  }
}
