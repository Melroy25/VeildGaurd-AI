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
let isReTriggering = false; // Prevents extension from intercepting its own re-triggered submissions

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
  // If this event was dispatched by VeilGuard itself to re-trigger an allowed submission,
  // let it pass directly to the host page's event listener.
  if (isReTriggering) {
    return;
  }

  const text = adapter.getText();

  if (flowState !== "idle") {
    // Already analyzing or blocked — cancel the re-entrancy
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

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
  let profile = "company";
  try {
    const profileResult = await chrome.storage.local.get("vg_profile");
    if (typeof profileResult["vg_profile"] === "string") {
      profile = profileResult["vg_profile"];
    }
  } catch (err) {
    console.warn("[VG_FLOW] Error getting vg_profile:", err);
  }

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
      hideOverlay();
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
      retriggerSubmission(adapter, text);
      break;

    case "redact":
    case "require_approval":
    case "block":
      // Show review overlay for user decision (Phase 3b human confirmation)
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
        onCancel: () => {
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
            outcome: "user_cancelled",
            destination,
          });
        },
        onSendOriginalConfirmed: () => {
          hideOverlay();
          flowState = "idle";
          updateBadgeState("active");
          retriggerSubmission(adapter, text);
          recordEvent({
            timestamp: new Date().toISOString(),
            category: engineResult.primary_rule_id ?? "UNKNOWN",
            entityCount: engineResult.findings.length,
            riskScore: engineResult.findings.reduce((max, f) => Math.max(max, f.score), 0),
            decision: engineResult.decision,
            ruleIds: engineResult.matched_rule_ids,
            outcome: "user_overrode",
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
  text: string
): void {
  // Pre-approve the text for the MAIN-world backstop so it doesn't re-query
  window.postMessage({ type: "VEILGUARD_PRE_APPROVE", text }, "*");
  try {
    window.dispatchEvent(new CustomEvent("veilguard_pre_approve", { detail: { text } }));
  } catch {}

  setTimeout(() => {
    isReTriggering = true;
    try {
      adapter.triggerSend();
    } finally {
      setTimeout(() => {
        isReTriggering = false;
      }, 150);
    }
  }, 25);
}


// ---------------------------------------------------------------------------
// Send sanitized (after user approval in overlay)
// ---------------------------------------------------------------------------

async function handleSendSanitized(
  adapter: SiteAdapter,
  engineResult: EngineAnalyzeResponse,
  _path: "enter" | "click" | "submit" | "backstop_fetch" | "backstop_xhr",
  destination: string
): Promise<void> {
  adapter.setText(engineResult.sanitized_text);
  retriggerSubmission(adapter, engineResult.sanitized_text);
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
      hideOverlay();
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

// ---------------------------------------------------------------------------
// Engine-backed backstop verdict handler (Part E)
//
// Receives VEILGUARD_CHECK_REQUEST from the MAIN-world page-world script,
// runs engine analysis via the background, and posts VEILGUARD_VERDICT back.
//
// The page-world script cannot call chrome.runtime.sendMessage directly
// (MAIN world restriction), so this content-script bridge is required.
// ---------------------------------------------------------------------------

interface CheckRequestMessage {
  type: "VEILGUARD_CHECK_REQUEST";
  requestId: string;
  transport: "fetch" | "xhr";
  text: string;
  destination: string;
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== "VEILGUARD_CHECK_REQUEST") return;

  const msg = event.data as CheckRequestMessage;
  const { requestId, text, destination } = msg;

  if (!text || text.trim().length === 0) {
    // Empty — allow through
    window.postMessage({ type: "VEILGUARD_VERDICT", requestId, allow: true }, "*");
    return;
  }

  // Get stored profile preference
  chrome.storage.local.get("vg_profile", (profileResult) => {
    const profile = typeof profileResult["vg_profile"] === "string"
      ? profileResult["vg_profile"]
      : "company";

    chrome.runtime.sendMessage(
      { type: "ANALYZE", text, destination, profile },
      (response: unknown) => {
        let allow = false;
        if (chrome.runtime.lastError || !response) {
          // Engine unreachable — fail closed
          allow = false;
        } else {
          const r = response as AnalyzeResponse;
          if (r.ok) {
            // Only "allow" decisions pass through the backstop.
            // "redact"/"require_approval"/"block" all result in a block here;
            // the DOM-layer flow handles those decisions with the review overlay.
            allow = r.result.decision === "allow";
          }
        }

        // Post verdict back to MAIN world
        window.postMessage(
          { type: "VEILGUARD_VERDICT", requestId, allow },
          "*"
        );

        if (!allow) {
          // Show overlay notification (avoid double-show if flow already blocked)
          handleBackstopBlocked(msg.transport);
        }
      }
    );
  });
});

// Expose getTabId for vault calls if needed
export { getTabId };
