/**
 * VeilGuard AI - Background Service Worker (Manifest V3)
 *
 * Central message router between content scripts and:
 *  - Local Python engine (via engine-client.ts)
 *  - Session vault (via vault.ts)
 *  - Audit log (via audit.ts)
 *
 * Security invariants:
 *  - Token is loaded here and NEVER forwarded to content scripts (Rules 7, 9).
 *  - All engine communication is strictly to 127.0.0.1:8765 (Rule 5).
 *  - Fail closed: EngineError results in ok:false response — content script
 *    must block the submission (Rule 6).
 *  - Raw text is passed through ANALYZE calls but never logged here (Rule 7).
 *
 * Sender validation:
 *  - Only messages with a verified chrome extension sender are accepted.
 *  - Messages from web pages or non-extension origins are silently rejected.
 */

import {
  analyze,
  ping,
  fetchProfiles,
  EngineError,
} from "./engine-client";

import {
  vaultGet,
  vaultMerge,
  vaultClear,
} from "./vault";

import { defaultEventStore } from "./events-store";

import {
  isVeilGuardRequest,
  type VeilGuardRequest,
  type AnalyzeResponse,
  type PingResponse,
  type ProfilesResponse,
  type VaultGetResponse,
  type AckResponse,
} from "../shared/messages";

console.log("[VeilGuard AI] Background service worker initialized (Phase 3b).");

// ---------------------------------------------------------------------------
// Installation lifecycle: open onboarding welcome page on first install
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});

// ---------------------------------------------------------------------------
// Tab lifecycle: clear vault when tab closes
// ---------------------------------------------------------------------------

chrome.tabs.onRemoved.addListener((tabId) => {
  vaultClear(tabId).catch(() => {
    // Best-effort: vault may already be empty
  });
});

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

type ResponseCallback = (
  response: AnalyzeResponse | PingResponse | ProfilesResponse | VaultGetResponse | AckResponse
) => void;

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: ResponseCallback
  ): boolean => {
    // Sender validation: only accept messages from this extension's own scripts.
    // Reject any message originating from a web page or external context.
    if (!sender.id || sender.id !== chrome.runtime.id) {
      console.warn("[VG_BG] Rejected message due to sender ID mismatch:", sender.id, "vs", chrome.runtime.id);
      return false;
    }

    if (!isVeilGuardRequest(message)) {
      console.warn("[VG_BG] Rejected message as not a valid VeilGuardRequest:", message);
      return false;
    }

    // Handle asynchronously and return true to keep the message channel open
    handleRequest(message, sender)
      .then((res) => {
        sendResponse(res);
      })
      .catch((err: unknown) => {
        console.error("[VeilGuard AI] Unhandled background error:", err);
        sendResponse({
          ok: false,
          errorKind: "engine_error",
          errorMessage: err instanceof Error ? err.message : String(err),
        } as AnalyzeResponse);
      });

    return true; // Keep sendResponse channel open for async response
  }
);

async function handleRequest(
  message: VeilGuardRequest,
  sender: chrome.runtime.MessageSender
): Promise<AnalyzeResponse | PingResponse | ProfilesResponse | VaultGetResponse | AckResponse> {
  switch (message.type) {
    case "ANALYZE": {
      try {
        let knownPlaceholders = message.knownPlaceholders ?? [];
        if (sender.tab?.id != null && knownPlaceholders.length === 0) {
          knownPlaceholders = await vaultGet(sender.tab.id);
        }

        const result = await analyze(
          message.text,
          message.destination,
          message.profile ?? "company",
          knownPlaceholders
        );

        // Merge newly discovered placeholders into the session vault for this tab.
        // Build KnownPlaceholder list from findings that have a placeholder assigned.
        if (sender.tab?.id != null) {
          const newMappings = result.findings
            .filter((f) => f.placeholder != null && f.value != null)
            .map((f) => ({
              entity_type: f.entity_type,
              value: f.value,
              placeholder: f.placeholder as string,
            }));

          if (newMappings.length > 0) {
            await vaultMerge(sender.tab.id, newMappings);
          }
        }

        const response: AnalyzeResponse = { ok: true, result };
        return response;
      } catch (err: unknown) {
        if (err instanceof EngineError) {
          const response: AnalyzeResponse = {
            ok: false,
            errorKind: err.kind,
            errorMessage: err.message,
          };
          return response;
        }
        return {
          ok: false,
          errorKind: "engine_error",
          errorMessage: err instanceof Error ? err.message : "Unknown error during analysis",
        } satisfies AnalyzeResponse;
      }
    }

    case "PING": {
      try {
        const health = await ping();
        const response: PingResponse = { ok: true, health };
        return response;
      } catch (err: unknown) {
        if (err instanceof EngineError) {
          return { ok: false, errorKind: err.kind, errorMessage: err.message } satisfies PingResponse;
        }
        return { ok: false, errorKind: "engine_error", errorMessage: "Unknown ping error" } satisfies PingResponse;
      }
    }

    case "FETCH_PROFILES": {
      try {
        const data = await fetchProfiles();
        const response: ProfilesResponse = {
          ok: true,
          profiles: data.profiles,
          ruleReasons: data.ruleReasons,
        };
        return response;
      } catch (err: unknown) {
        if (err instanceof EngineError) {
          return { ok: false, errorKind: err.kind, errorMessage: err.message } satisfies ProfilesResponse;
        }
        return { ok: false, errorKind: "engine_error", errorMessage: "Unknown profiles error" } satisfies ProfilesResponse;
      }
    }

    case "RECORD_EVENT": {
      // Fire-and-forget audit recording — metadata only (Rule 7)
      await defaultEventStore.appendEvent(message.event);
      return { ok: true } satisfies AckResponse;
    }

    case "VAULT_GET": {
      const placeholders = await vaultGet(message.tabId);
      return { ok: true, placeholders } satisfies VaultGetResponse;
    }

    case "VAULT_MERGE": {
      await vaultMerge(message.tabId, message.placeholders);
      return { ok: true } satisfies AckResponse;
    }

    case "VAULT_CLEAR": {
      await vaultClear(message.tabId);
      return { ok: true } satisfies AckResponse;
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[VeilGuard AI] Extension installed/updated (Phase 3b).");
});
