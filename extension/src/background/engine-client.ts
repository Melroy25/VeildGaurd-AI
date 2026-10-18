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

export interface EngineContextTask {
  type: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

export interface EngineFindingNecessity {
  finding_id: string;
  level: string;
}

export interface EngineReidContributor {
  type: string;
  weight: number;
}

export interface EngineContextReid {
  score_before: number;
  score_after: number;
  level_before: "low" | "medium" | "high";
  level_after: "low" | "medium" | "high";
  contributors: EngineReidContributor[];
  target: number;
  applied: string[];
}

export interface EngineContextTradeoff {
  finding_id?: string;
  category?: string;
  tradeoff?: string;
}

export interface EngineContextUtility {
  basis: "task_aware" | "type_only";
  may_change_result: "low" | "possible" | "high";
  notes: string[];
}

export interface EngineContextBlock {
  task: EngineContextTask;
  necessity: EngineFindingNecessity[];
  reidentification: EngineContextReid;
  tradeoffs: EngineContextTradeoff[];
  utility: EngineContextUtility;
}

/** Full /analyze response from the engine. */
export interface EngineAnalyzeResponse {
  decision: "allow" | "redact" | "require_approval" | "block";
  options: string[];
  sanitized_text: string;
  findings: EngineFinding[];
  summary: string;
  primary_rule_id: string | null;
  matched_rule_ids: string[];
  may_change_result: boolean;
  offset_unit: "utf16";
  verification: SanitizeVerification;
  context?: EngineContextBlock;
}

/** /health response fields we care about. */
export interface EngineHealthResponse {
  status: string;
  version?: string;
}

/** /policy/profiles response. */
export interface EngineProfilesResponse {
  profiles: string[];
  ruleReasons: Record<string, string>;
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

  // Automatic Zero-Click Pairing: If no token stored, attempt loopback auto-pairing
  try {
    const pairRes = await fetch(`${ENGINE_BASE_URL}/auth/pair`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: chrome.runtime.getURL(""),
      },
    });
    if (pairRes.ok) {
      const pairData = (await pairRes.json()) as { token?: string };
      if (typeof pairData.token === "string" && pairData.token.length > 0) {
        await saveToken(pairData.token);
        console.log("[VeilGuard AI] Successfully auto-paired bearer token from local engine!");
        return pairData.token;
      }
    }
  } catch {
    // Engine not reachable yet or offline
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

  // Minimal shape validation — verify engine returned an object with decision
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as Record<string, unknown>)["decision"] !== "string"
  ) {
    throw new EngineError("parse_error", "Engine response missing required 'decision' field");
  }

  const raw = data as Record<string, unknown>;
  const sanitization = raw["sanitization"] as Record<string, unknown> | null | undefined;
  const appliedRules = (raw["applied_rules"] as Array<{ rule_id: string; reason: string }>) || [];
  const rawFindings = (raw["findings"] as Array<Record<string, unknown>>) || [];
  const replacements = (sanitization?.["replacements"] as Array<Record<string, unknown>>) || [];

  // Map replacement details (action, placeholder) onto findings by finding_id
  const replacementMap = new Map<string, { action: string; placeholder?: string }>();
  for (const rep of replacements) {
    if (typeof rep["finding_id"] === "string") {
      replacementMap.set(rep["finding_id"], {
        action: String(rep["action"] ?? "keep"),
        placeholder: typeof rep["placeholder"] === "string" ? rep["placeholder"] : undefined,
      });
    }
  }

  const findings: EngineFinding[] = rawFindings.map((f) => {
    const rep = replacementMap.get(String(f["id"] ?? ""));
    const start = Number(f["start"] ?? 0);
    const end = Number(f["end"] ?? 0);
    return {
      id: String(f["id"] ?? ""),
      entity_type: String(f["entity_type"] ?? ""),
      value: text.slice(start, end),
      start,
      end,
      score: Number(f["score"] ?? 0),
      detector: String(f["detector"] ?? ""),
      action: rep?.action ?? "keep",
      placeholder: rep?.placeholder,
    };
  });

  const utility = sanitization?.["utility"] as Record<string, unknown> | undefined;
  const verification = sanitization?.["verification"] as Record<string, unknown> | undefined;

  const result: EngineAnalyzeResponse = {
    decision: (raw["decision"] as EngineAnalyzeResponse["decision"]) ?? "allow",
    options: Array.isArray(raw["options"]) ? (raw["options"] as string[]) : [],
    sanitized_text:
      typeof sanitization?.["sanitized_text"] === "string" ? sanitization["sanitized_text"] : text,
    findings,
    summary: typeof raw["summary"] === "string" ? raw["summary"] : "",
    primary_rule_id: appliedRules[0]?.rule_id ?? null,
    matched_rule_ids: appliedRules.map((r) => r.rule_id),
    may_change_result: utility?.["may_change_result"] === "possible",
    offset_unit: "utf16",
    verification: {
      residual_count: Number(verification?.["residual_findings"] ?? 0),
      residual_findings: [],
    },
    context: (raw["context"] as EngineContextBlock | undefined) ?? undefined,
  };

  return result;
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
  const response = await engineFetch("/policy/profiles", { method: "GET" }, token);

  if (response.status === 401) {
    throw new EngineError("auth_error", "Engine rejected token fetching profiles (401).", 401);
  }
  if (!response.ok) {
    throw new EngineError("engine_error", `Engine profiles returned HTTP ${response.status}`, response.status);
  }

  try {
    const data = await response.json();
    const ruleReasons: Record<string, string> = {};
    if (Array.isArray(data)) {
      for (const item of data) {
        if (Array.isArray(item?.rules)) {
          for (const r of item.rules) {
            if (typeof r?.rule_id === "string" && typeof r?.reason === "string") {
              ruleReasons[r.rule_id] = r.reason;
            }
          }
        }
      }
      return {
        profiles: data.map((p: { profile: string }) => p.profile),
        ruleReasons,
      };
    }
    return { profiles: ["company", "personal", "finance"], ruleReasons: {} };
  } catch {
    throw new EngineError("parse_error", "Engine profiles response was not valid JSON");
  }
}
