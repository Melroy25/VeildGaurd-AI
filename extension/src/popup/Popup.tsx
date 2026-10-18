/**
 * VeilGuard AI - Popup Status UI (Part C)
 *
 * Shows engine status, active profile, today's counts, this-page status,
 * and an Open Dashboard button.
 *
 * Privacy invariants (Rule 7):
 *   - No raw prompt text, entity values, or token strings rendered.
 *   - Counts come from metadata-only StoredEvent objects.
 *
 * Permission constraints:
 *   - Does NOT use the `tabs` permission.
 *   - Production: uses chrome.tabs.query({active:true, currentWindow:true})
 *     which does not require the `tabs` permission in MV3.
 *   - Content-script status query via chrome.tabs.sendMessage without `tabs`.
 *
 * Test seam (Decision 31):
 *   Open popup.html?tabId=<n> to query a specific tab directly.
 *   This keeps the production code path clean while allowing Playwright tests
 *   to target the correct tab without the removed sibling-tab heuristic.
 */

import React, { useState, useEffect, useCallback } from "react";
import { EVENTS_STORAGE_KEY } from "../background/events-store";
import type { StoredEvent } from "../background/events-store";
import type { GetStatusResponse, SiteProtectionStatus } from "../shared/messages";

// ─── Types ────────────────────────────────────────────────────────────────────

type EngineStatus = "checking" | "connected" | "unreachable";
type PageStatus =
  | "checking"
  | "active"
  | "adapter self-test failed"
  | "engine unreachable"
  | "not active";

interface PingMsg {
  ok: boolean;
  health?: { status: string; version?: string };
  errorKind?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** ISO date string for local today (YYYY-MM-DD). */
function localTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isToday(isoTimestamp: string): boolean {
  return isoTimestamp.startsWith(localTodayStr());
}

interface TodayCounts {
  checked: number;
  sanitized: number;
  blocked: number;
}

function computeTodayCounts(events: StoredEvent[]): TodayCounts {
  let checked = 0;
  let sanitized = 0;
  let blocked = 0;
  for (const ev of events) {
    if (!isToday(ev.timestamp)) continue;
    checked++;
    if (ev.user_choice === "sent_sanitized") sanitized++;
    if (ev.user_choice === "blocked" || ev.user_choice === "failed_closed") blocked++;
  }
  return { checked, sanitized, blocked };
}

// ─── Status dot ──────────────────────────────────────────────────────────────

const StatusDot: React.FC<{ status: "ok" | "warn" | "err" | "idle" }> = ({
  status,
}) => {
  const colors = {
    ok: "bg-emerald-400",
    warn: "bg-amber-400 animate-pulse",
    err: "bg-red-500",
    idle: "bg-slate-500 animate-pulse",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status]}`}
      aria-hidden="true"
    />
  );
};

// ─── Count badge ─────────────────────────────────────────────────────────────

const CountBadge: React.FC<{ label: string; value: number; accent?: string }> = ({
  label,
  value,
  accent = "text-slate-200",
}) => (
  <div className="flex flex-col items-center">
    <span className={`text-xl font-bold font-mono ${accent}`}>{value}</span>
    <span className="text-[10px] text-slate-500">{label}</span>
  </div>
);

// ─── Main Popup ───────────────────────────────────────────────────────────────

export const Popup: React.FC = () => {
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("checking");
  const [engineVersion, setEngineVersion] = useState<string>("");
  const [activeProfile, setActiveProfile] = useState<string>("—");
  const [todayCounts, setTodayCounts] = useState<TodayCounts>({
    checked: 0,
    sanitized: 0,
    blocked: 0,
  });
  const [pageStatus, setPageStatus] = useState<PageStatus>("checking");

  // ── Load stored profile ──
  useEffect(() => {
    chrome.storage.local.get("vg_profile", (res) => {
      if (typeof res["vg_profile"] === "string") {
        setActiveProfile(res["vg_profile"]);
      }
    });
  }, []);

  // ── Load today's event counts ──
  useEffect(() => {
    chrome.storage.local.get(EVENTS_STORAGE_KEY, (res) => {
      const raw = res[EVENTS_STORAGE_KEY];
      if (Array.isArray(raw)) {
        setTodayCounts(computeTodayCounts(raw as StoredEvent[]));
      }
    });
  }, []);

  // ── Ping engine ──
  const pingEngine = useCallback(() => {
    setEngineStatus("checking");
    chrome.runtime.sendMessage({ type: "PING" }, (response: PingMsg) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setEngineStatus("unreachable");
        return;
      }
      setEngineStatus("connected");
      if (response.health?.version) {
        setEngineVersion(response.health.version);
      }
    });
  }, []);

  useEffect(() => {
    pingEngine();
  }, [pingEngine]);

  // ── Query active tab content script ──
  // Production path: chrome.tabs.query({active:true, currentWindow:true})
  // Test seam (Decision 31): ?tabId=<n> in URL → query that specific tab
  const queryContentScript = useCallback(() => {
    const sendStatusQuery = (targetTabId: number | undefined) => {
      if (!targetTabId) {
        setPageStatus("not active");
        return;
      }
      try {
        chrome.tabs.sendMessage(
          targetTabId,
          { type: "GET_STATUS" },
          (response: GetStatusResponse | undefined) => {
            if (chrome.runtime.lastError || !response) {
              // No content script on this page
              setPageStatus("not active");
              return;
            }
            setPageStatus(response.status as SiteProtectionStatus);
          }
        );
      } catch {
        setPageStatus("not active");
      }
    };

    // Check for the documented test seam: popup.html?tabId=<n> (Decision 31)
    // Ignored unless it matches an existing tab.
    const params = new URLSearchParams(window.location.search);
    const seamTabId = params.get("tabId");
    if (seamTabId !== null) {
      const parsed = parseInt(seamTabId, 10);
      if (Number.isFinite(parsed)) {
        try {
          chrome.tabs.get(parsed, (tab) => {
            if (!chrome.runtime.lastError && tab?.id != null) {
              sendStatusQuery(tab.id);
            } else {
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                sendStatusQuery(tabs?.[0]?.id);
              });
            }
          });
          return;
        } catch {
          // Fall through to production query
        }
      }
    }

    // Production: query active tab in the browser window
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs?.[0]?.id != null) {
        sendStatusQuery(tabs[0].id);
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (fallbackTabs) => {
          sendStatusQuery(fallbackTabs?.[0]?.id);
        });
      }
    });
  }, []);

  useEffect(() => {
    queryContentScript();
  }, [queryContentScript]);

  // ── Page status display ──
  const pageStatusInfo = (): { label: string; dot: "ok" | "warn" | "err" | "idle"; sub?: string } => {
    switch (pageStatus) {
      case "checking":
        return { label: "Checking…", dot: "idle" };
      case "active":
        return { label: "Protected", dot: "ok" };
      case "adapter self-test failed":
        return {
          label: "Adapter error",
          dot: "warn",
          sub: "Self-test failed — protection may be incomplete.",
        };
      case "engine unreachable":
        return {
          label: "Engine unreachable",
          dot: "err",
          sub: "Sending is blocked while the engine is unreachable.",
        };
      case "not active":
        return {
          label: "Not active on this site",
          dot: "err",
          sub: "Unsupported site — no content script is running here.",
        };
    }
  };

  const { label: pageLabel, dot: pageDot, sub: pageSub } = pageStatusInfo();

  const engineDot: "ok" | "warn" | "idle" | "err" =
    engineStatus === "connected"
      ? "ok"
      : engineStatus === "checking"
      ? "idle"
      : "err";

  return (
    <div className="w-80 font-sans bg-slate-900 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-bold text-sky-400">VeilGuard AI</h1>
        <span className="text-[10px] text-slate-500 font-mono">Phase 3c</span>
      </header>

      <div className="px-4 pt-3 pb-2 space-y-4">
        {/* Engine status */}
        <section aria-label="Engine status">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
            Engine
          </p>
          <div className="flex items-center gap-2">
            <StatusDot status={engineDot} />
            <span className="text-sm text-slate-200">
              {engineStatus === "connected"
                ? `Connected${engineVersion ? ` (v${engineVersion})` : ""}`
                : engineStatus === "checking"
                ? "Checking…"
                : "Unreachable"}
            </span>
          </div>
          {engineStatus === "unreachable" && (
            <p className="text-xs text-red-400 mt-1">
              Sending is blocked while the engine is unreachable.
            </p>
          )}
        </section>

        {/* Active profile */}
        <section aria-label="Active policy profile">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
            Active profile
          </p>
          <span className="text-sm font-medium text-slate-200">{activeProfile}</span>
        </section>

        {/* Today's counts */}
        <section aria-label="Today's counts">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
            Today
          </p>
          <div className="flex justify-between px-2 py-3 bg-slate-800 rounded-lg">
            <CountBadge label="Checked" value={todayCounts.checked} />
            <div className="w-px bg-slate-700" />
            <CountBadge
              label="Sanitized"
              value={todayCounts.sanitized}
              accent="text-emerald-300"
            />
            <div className="w-px bg-slate-700" />
            <CountBadge
              label="Blocked"
              value={todayCounts.blocked}
              accent={todayCounts.blocked > 0 ? "text-red-400" : "text-slate-200"}
            />
          </div>
        </section>

        {/* This page */}
        <section aria-label="This page protection status">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">
            This page
          </p>
          <div className="flex items-start gap-2">
            <StatusDot status={pageDot} />
            <div>
              <span className="text-sm text-slate-200">{pageLabel}</span>
              {pageSub && (
                <p className="text-xs text-slate-400 mt-0.5">{pageSub}</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={pingEngine}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          aria-label="Re-check engine status"
        >
          ↻ Refresh
        </button>
        <button
          type="button"
          onClick={() => chrome.runtime.openOptionsPage?.()}
          className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-xs font-semibold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          Open Dashboard
        </button>
      </footer>
    </div>
  );
};
