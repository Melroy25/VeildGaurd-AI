/**
 * VeilGuard AI - Content Script Submission State Machine
 *
 * Intercepts user submissions, sends them to the background for engine
 * analysis, and routes them through the review overlay or blocks them.
 *
 * State transitions:
 *   IDLE → ANALYZING → (BLOCKED | REVIEW | ALLOWED)
 *
 * Security invariants:
 *  - Fail closed: If engine is unreachable or returns an error, submission
 *    is blocked with a clear "Engine Unreachable" notice. No "send anyway"
 *    option is presented (Rule 6).
 *  - Raw prompt text is never logged (Rule 7). Only metadata is passed to
 *    RECORD_EVENT.
 *  - Token never accessed here — background handles all engine calls.
 *  - Debounce prevents race conditions on rapid Enter/click events.
 *
 * Phase 3b scope:
 *  - Engine-backed analysis replaces stub detector.
 *  - Review overlay shows original vs sanitized diff.
 *  - Vault seeding for multi-turn consistency.
 */

import type { SiteAdapter } from "./adapters/types";
import type { AnalyzeResponse, AuditEventMetadata } from "../shared/messages";
import type { EngineAnalyzeResponse } from "../shared/messages";
import {
  showReviewOverlay,
  showEngineErrorOverlay,
  hideOverlay,
} from "./ui/overlay";
import { renderProtectionBadge, updateBadgeState } from "./ui/badge";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type FlowState = "idle" | "analyzing" | "blocked";

let flowState: FlowState = "idle";
let analyzeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 80; // Prevents double-fire on Enter + form submit

// ---------------------------------------------------------------------------
// Vault helpers (via background messages)
// ---------------------------------------------------------------------------

async function getTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "PING" }, () => {
      // We don't need the tabId for vault calls — background reads sender.tab.id
      resolve(null);
    });
  });
}

// ---------------------------------------------------------------------------
// Main interception entry point
// ---------------------------------------------------------------------------

/**
 * Called when a submission event is intercepted.
 * Cancels the event, runs analysis, then either allows, blocks, or reviews.
 */
export function handleInterception(
  adapter: SiteAdapter,
  event: Event,
  path: "enter" | "click" | "submit"
): void {
  if (flowState !== "idle") {
    // Already analyzing or blocked — cancel the re-entrancy
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  const text = adapter.getText();
  if (!text || text.trim().length === 0) {
    // Empty submission — allow through (no content to inspect)
    return;
  }

  // Intercept the submission
  event.preventDefault();
  event.stopImmediatePropagation();

  // Debounce in case multiple listeners fire for the same event
  if (analyzeDebounceTimer !== null) {
    clearTimeout(analyzeDebounceTimer);
  }
  analyzeDebounceTimer = setTimeout(() => {
    analyzeDebounceTimer = null;
    runAnalysis(adapter, text, path);
  }, DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Analysis flow
// ---------------------------------------------------------------------------

async function runAnalysis(
  adapter: SiteAdapter,
  text: string,
  path: "enter" | "click" | "submit" | "backstop_fetch" | "backstop_xhr"
): Promise<void> {
  flowState = "analyzing";
  updateBadgeState("analyzing");

  const destination = window.location.hostname;

  // Retrieve currently stored profile preference
  const profileResult = await chrome.storage.local.get("vg_profile");
  const profile = typeof profileResult["vg_profile"] === "string"
    ? profileResult["vg_profile"]
    : "company";

  // Build ANALYZE request — background handles token and vault merging
  const response = await new Promise<AnalyzeResponse>((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "ANALYZE",
        text,
        destination,
        profile,
        // knownPlaceholders: background auto-merges via vault on ANALYZE
      },
      (msg: unknown) => {
        if (chrome.runtime.lastError || !msg) {
          resolve({
            ok: false,
            errorKind: "unreachable",
            errorMessage: chrome.runtime.lastError?.message ?? "No response from background",
          });
        } else {
          resolve(msg as AnalyzeResponse);
        }
      }
    );
  });

  // Handle engine failure — fail closed
  if (!response.ok) {
    flowState = "blocked";
    updateBadgeState("error");
    showEngineErrorOverlay(response.errorKind, response.errorMessage, () => {
      flowState = "idle";
      updateBadgeState("active");
    });
    recordEvent({
      timestamp: new Date().toISOString(),
      category: "ENGINE_UNREACHABLE",
      entityCount: 0,
      riskScore: 0,
      decision: "block",
      ruleIds: [],
      outcome: "engine_unreachable",
      destination,
    });
    return;
  }

  const engineResult = response.result;

  // Route based on engine decision
  switch (engineResult.decision) {
    case "allow":
      // Clean — allow the original submission through
      flowState = "idle";
      updateBadgeState("active");
      retriggerSubmission(adapter, path);
      break;

    case "redact":
      // Auto-redact: replace composer text with sanitized version then re-submit
      await handleRedactAndSend(adapter, engineResult, path, destination);
      break;

    case "require_approval":
    case "block":
      // Show review overlay for user decision
      flowState = "blocked";
      updateBadgeState("review");
      showReviewOverlay({
        engineResult,
        originalText: text,
        isBlockDecision: engineResult.decision === "block",
        onSendSanitized: async () => {
          hideOverlay();
          flowState = "idle";
          updateBadgeState("active");
          await handleSendSanitized(adapter, engineResult, path, destination);
        },
        onEdit: () => {
          hideOverlay();
          flowState = "idle";
          updateBadgeState("active");
          recordEvent({
            timestamp: new Date().toISOString(),
            category: engineResult.primary_rule_id ?? "UNKNOWN",
            entityCount: engineResult.findings.length,
            riskScore: engineResult.findings.reduce((max, f) => Math.max(max, f.score), 0),
            decision: engineResult.decision,
            ruleIds: engineResult.matched_rule_ids,
            outcome: "user_edited",
            destination,
          });
        },
      });
      break;
  }
}

// ---------------------------------------------------------------------------
// Re-trigger helpers (allow path)
// ---------------------------------------------------------------------------

/**
 * Allows the submission to proceed by re-triggering it once the extension
 * has stepped out of the capture-phase intercept.
 * Uses adapter.triggerSend() to fire the appropriate DOM event.
 */
function retriggerSubmission(
  adapter: SiteAdapter,
  _path: string
): void {
  // Use a microtask to yield so the current event stack fully unwinds
  // before re-triggering, preventing re-entrant interception
  setTimeout(() => {
    adapter.triggerSend();
  }, 0);
}

// ---------------------------------------------------------------------------
// Redact and send (auto-redact path)
// ---------------------------------------------------------------------------

async function handleRedactAndSend(
  adapter: SiteAdapter,
  engineResult: EngineAnalyzeResponse,
  path: "enter" | "click" | "submit" | "backstop_fetch" | "backstop_xhr",
  destination: string
): Promise<void> {
  const set = adapter.setText(engineResult.sanitized_text);
  if (!set) {
    // setText verification failed — show review overlay instead (fail safe)
    flowState = "blocked";
    updateBadgeState("review");
    showReviewOverlay({
      engineResult,
      originalText: engineResult.sanitized_text,
      isBlockDecision: false,
      onSendSanitized: async () => {
        hideOverlay();
        flowState = "idle";
        updateBadgeState("active");
        await handleSendSanitized(adapter, engineResult, path, destination);
      },
      onEdit: () => {
        hideOverlay();
        flowState = "idle";
        updateBadgeState("active");
      },
    });
    return;
  }

  flowState = "idle";
  updateBadgeState("active");
  retriggerSubmission(adapter, path);
  recordEvent({
    timestamp: new Date().toISOString(),
    category: engineResult.primary_rule_id ?? "UNKNOWN",
    entityCount: engineResult.findings.length,
    riskScore: engineResult.findings.reduce((max, f) => Math.max(max, f.score), 0),
    decision: engineResult.decision,
    ruleIds: engineResult.matched_rule_ids,
    outcome: "redacted_and_sent",
    destination,
  });
}

// ---------------------------------------------------------------------------
// Send sanitized (after user approval in overlay)
// ---------------------------------------------------------------------------

async function handleSendSanitized(
  adapter: SiteAdapter,
  engineResult: EngineAnalyzeResponse,
  path: "enter" | "click" | "submit" | "backstop_fetch" | "backstop_xhr",
  destination: string
): Promise<void> {
  adapter.setText(engineResult.sanitized_text);
  retriggerSubmission(adapter, path);
  recordEvent({
    timestamp: new Date().toISOString(),
    category: engineResult.primary_rule_id ?? "UNKNOWN",
    entityCount: engineResult.findings.length,
    riskScore: engineResult.findings.reduce((max, f) => Math.max(max, f.score), 0),
    decision: engineResult.decision,
    ruleIds: engineResult.matched_rule_ids,
    outcome: "user_approved",
    destination,
  });
}

// ---------------------------------------------------------------------------
// Audit event recording (fire-and-forget)
// ---------------------------------------------------------------------------

function recordEvent(event: AuditEventMetadata): void {
  // Fire-and-forget — do not await
  chrome.runtime.sendMessage({ type: "RECORD_EVENT", event });
}

// ---------------------------------------------------------------------------
// MAIN-world backstop notification handler
// ---------------------------------------------------------------------------

/**
 * Handles VEILGUARD_BACKSTOP_BLOCKED notifications from the MAIN-world
 * page-world script when a programmatic fetch/XHR is intercepted.
 */
export function handleBackstopBlocked(transport: "fetch" | "xhr"): void {
  if (flowState !== "idle") return;

  const path = transport === "fetch" ? "backstop_fetch" : "backstop_xhr";
  // We don't have the text here (it was intercepted in page-world), so we
  // just record the block and show the engine-error overlay to inform the user
  flowState = "blocked";
  updateBadgeState("review");
  showEngineErrorOverlay(
    "backstop",
    "A programmatic API submission was intercepted and blocked. No content was transmitted.",
    () => {
      flowState = "idle";
      updateBadgeState("active");
    }
  );
  recordEvent({
    timestamp: new Date().toISOString(),
    category: "BACKSTOP_BLOCK",
    entityCount: 0,
    riskScore: 1,
    decision: "block",
    ruleIds: [],
    outcome: "blocked",
    destination: path,
  });
}

// ---------------------------------------------------------------------------
// Badge mount on content script init
// ---------------------------------------------------------------------------

export function mountBadge(adapter: SiteAdapter): void {
  adapter.selfTest().then((passed) => {
    renderProtectionBadge(passed);
  });
}

// Expose getTabId for vault calls if needed
export { getTabId };
