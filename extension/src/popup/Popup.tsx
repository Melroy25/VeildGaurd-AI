/**
 * VeilGuard AI - Popup Status UI
 *
 * Blue Glass aesthetic with frosted panels, glowing indicators,
 * live engine status, active profile, today's counts, and dashboard link.
 *
 * Privacy invariants (Rule 7):
 *   - No raw prompt text, entity values, or token strings rendered.
 *   - Counts come from metadata-only StoredEvent objects.
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
  const styles = {
    ok: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    warn: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)] animate-pulse",
    err: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]",
    idle: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.7)] animate-pulse",
  };
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${styles[status]}`}
      aria-hidden="true"
    />
  );
};

// ─── Count badge ─────────────────────────────────────────────────────────────

const CountBadge: React.FC<{ label: string; value: number; accent?: string }> = ({
  label,
  value,
  accent = "text-slate-100",
}) => (
  <div className="flex flex-col items-center flex-1 py-1">
    <span className={`text-xl font-bold font-mono tracking-tight ${accent}`}>{value}</span>
    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mt-0.5">{label}</span>
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

  // Load stored profile
  useEffect(() => {
    chrome.storage.local.get("vg_profile", (res) => {
      if (typeof res["vg_profile"] === "string") {
        setActiveProfile(res["vg_profile"]);
      }
    });
  }, []);

  // Load today's event counts
  useEffect(() => {
    chrome.storage.local.get(EVENTS_STORAGE_KEY, (res) => {
      const raw = res[EVENTS_STORAGE_KEY];
      if (Array.isArray(raw)) {
        setTodayCounts(computeTodayCounts(raw as StoredEvent[]));
      }
    });
  }, []);

  // Ping engine
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

  // Query active tab content script
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
          // fallback
        }
      }
    }

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
    <div className="w-[340px] font-sans bg-[#060b14] text-slate-100 flex flex-col border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
      {/* Blue Glass Glow Ambient Background */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-sky-500/10 rounded-full blur-3xl pointer-events-none -z-0" />
      <div className="absolute bottom-0 left-0 w-36 h-36 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -z-0" />

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.08] px-4 py-3.5 flex items-center justify-between bg-white/[0.02] backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-sky-500 to-cyan-400 flex items-center justify-center shadow-[0_0_12px_rgba(56,189,248,0.4)]">
            <svg className="w-3.5 h-3.5 text-slate-950 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              VeilGuard <span className="text-sky-400">AI</span>
            </h1>
          </div>
        </div>
        <span className="text-[10px] font-semibold tracking-wider text-sky-400 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded-full">
          FIREWALL ACTIVE
        </span>
      </header>

      {/* Body Cards */}
      <div className="relative z-10 px-4 pt-3.5 pb-2.5 space-y-3">
        {/* Engine status card */}
        <section aria-label="Engine status" className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Local Engine
            </span>
            <span className="text-[10px] font-mono text-slate-400">127.0.0.1:8765</span>
          </div>
          <div className="flex items-center gap-2.5">
            <StatusDot status={engineDot} />
            <span className="text-sm font-medium text-slate-100">
              {engineStatus === "connected"
                ? `Connected${engineVersion ? ` (v${engineVersion})` : ""}`
                : engineStatus === "checking"
                ? "Checking…"
                : "Unreachable"}
            </span>
          </div>
          {engineStatus === "unreachable" && (
            <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/40 rounded-lg p-2 mt-2">
              Sending is blocked while the engine is unreachable.
            </p>
          )}
        </section>

        {/* Active profile card */}
        <section aria-label="Active policy profile" className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
              Active Policy
            </p>
            <span className="text-sm font-semibold text-sky-400 capitalize">{activeProfile}</span>
          </div>
          <span className="text-[11px] text-slate-400 bg-white/[0.04] px-2.5 py-1 rounded-md border border-white/[0.06]">
            Strict Rule Core
          </span>
        </section>

        {/* Today's counts */}
        <section aria-label="Today's counts" className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Activity Today
          </p>
          <div className="flex justify-between divide-x divide-white/[0.08] bg-black/30 rounded-lg p-1.5 border border-white/[0.04]">
            <CountBadge label="Checked" value={todayCounts.checked} />
            <CountBadge
              label="Sanitized"
              value={todayCounts.sanitized}
              accent="text-sky-300"
            />
            <CountBadge
              label="Blocked"
              value={todayCounts.blocked}
              accent={todayCounts.blocked > 0 ? "text-rose-400" : "text-slate-300"}
            />
          </div>
        </section>

        {/* This page */}
        <section aria-label="This page protection status" className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Active Tab Protection
          </p>
          <div className="flex items-start gap-2.5">
            <StatusDot status={pageDot} />
            <div>
              <span className="text-sm font-medium text-slate-100">{pageLabel}</span>
              {pageSub && (
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{pageSub}</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.08] px-4 py-3 flex items-center justify-between bg-white/[0.02] backdrop-blur-md">
        <button
          type="button"
          onClick={pingEngine}
          className="text-xs font-medium text-slate-300 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 flex items-center gap-1.5 cursor-pointer"
          aria-label="Re-check engine status"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Re-check
        </button>
        <button
          type="button"
          onClick={() => chrome.runtime.openOptionsPage?.()}
          className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-xs font-semibold text-slate-950 transition-all shadow-[0_2px_12px_rgba(56,189,248,0.35)] hover:shadow-[0_4px_16px_rgba(56,189,248,0.5)] cursor-pointer"
        >
          Open Dashboard
        </button>
      </footer>
    </div>
  );
};
