/**
 * VeilGuard AI - Options / Dashboard Page
 *
 * Two tabs:
 *   - Dashboard: live aggregation from stored metadata events, 10 sections.
 *   - Settings:  token, profile, test connection, clear vault, history controls.
 *
 * Privacy invariants (Rule 7):
 *   - No raw prompt text, matched values, entity-to-placeholder mappings, or
 *     token strings are ever rendered in this component.
 *   - All numbers come from sanitized StoredEvent objects via summarize().
 *   - Never uses innerHTML for event-derived data.
 *
 * Chart policy: hand-built SVG/CSS bars only. No external chart libraries.
 * External resource policy: zero remote fonts, scripts, or images.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  summarize,
  filterEvents,
  type SummaryResult,
  type EventFilter,
} from "../shared/aggregate";
import type { StoredEvent } from "../background/events-store";
import { EVENTS_STORAGE_KEY, RECORD_HISTORY_KEY } from "../background/events-store";
import benchmarkSummaryData from "./benchmark-summary.json";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "settings";
type TimeRange = "24h" | "7d" | "all";
type ConnectionStatus = "idle" | "checking" | "ok" | "error";

interface ProfilesMsg {
  ok: boolean;
  profiles?: string[];
  ruleReasons?: Record<string, string>;
  errorMessage?: string;
}

interface PingMsg {
  ok: boolean;
  health?: { status: string; version?: string };
  errorMessage?: string;
  errorKind?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DECISION_LABELS: Record<string, string> = {
  allow: "No sensitive content found",
  redact: "Sensitive details found (redaction recommended)",
  require_approval: "Needs your decision",
  block: "Blocked",
};

const DECISION_COLORS: Record<string, string> = {
  allow: "#22c55e",
  redact: "#eab308",
  require_approval: "#f97316",
  block: "#ef4444",
};

const USER_CHOICE_LABELS: Record<string, string> = {
  sent_sanitized: "Sent sanitized",
  sent_original: "Sent original after confirmation",
  edited: "Edited before sending",
  cancelled: "Cancelled",
  failed_closed: "Blocked (engine unreachable)",
  auto_allowed: "Sent unchanged (no sensitive content)",
  blocked: "Blocked by policy",
};

const USER_CHOICE_COLORS: Record<string, string> = {
  sent_sanitized: "#22c55e",
  sent_original: "#f97316",
  edited: "#38bdf8",
  cancelled: "#94a3b8",
  failed_closed: "#ef4444",
  auto_allowed: "#6ee7b7",
  blocked: "#dc2626",
};

const EVENTS_PER_PAGE = 25;

// ─── Bar chart component (CSS/SVG only, no library) ───────────────────────────

interface BarChartProps {
  entries: Array<{ label: string; value: number; color: string }>;
  ariaLabel: string;
}

const BarChart: React.FC<BarChartProps> = ({ entries, ariaLabel }) => {
  const max = Math.max(...entries.map((e) => e.value), 1);
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="space-y-2"
    >
      {entries.map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-2 text-sm">
          <span
            className="w-44 flex-shrink-0 text-slate-300 text-xs truncate"
            title={label}
          >
            {label}
          </span>
          <div
            className="h-5 rounded flex-1 bg-slate-800 overflow-hidden"
            aria-hidden="true"
          >
            <div
              style={{
                width: `${(value / max) * 100}%`,
                backgroundColor: color,
                height: "100%",
                borderRadius: "2px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span
            className="w-10 text-right text-slate-200 text-xs font-mono flex-shrink-0"
            aria-label={`${value} events`}
          >
            {value}
          </span>
        </div>
      ))}
      {/* Screen-reader accessible text table */}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th>Category</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ label, value }) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Activity sparkline (14-day) ──────────────────────────────────────────────

interface ActivityBarsProps {
  data: Array<{ date: string; count: number }>;
}

const ActivityBars: React.FC<ActivityBarsProps> = ({ data }) => {
  const max = Math.max(...data.map((d) => d.count), 1);
  const BAR_H = 40;
  const BAR_W = 14;
  const GAP = 3;
  const totalW = data.length * (BAR_W + GAP);

  return (
    <div>
      <svg
        role="img"
        aria-label="Activity over the last 14 days"
        width={totalW}
        height={BAR_H + 20}
        className="overflow-visible"
      >
        {data.map((d, i) => {
          const barH = max === 0 ? 2 : Math.max(2, Math.round((d.count / max) * BAR_H));
          const x = i * (BAR_W + GAP);
          const y = BAR_H - barH;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={BAR_W}
                height={barH}
                rx={2}
                fill="#38bdf8"
                opacity={d.count === 0 ? 0.2 : 0.85}
                aria-label={`${d.date}: ${d.count}`}
              />
              {/* Date label every 7 days */}
              {(i === 0 || i === 6 || i === 13) && (
                <text
                  x={x + BAR_W / 2}
                  y={BAR_H + 15}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#64748b"
                >
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* SR table */}
      <table className="sr-only">
        <caption>14-day activity</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Events</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Summary Card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: number | string;
  sub?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, sub }) => (
  <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col gap-1">
    <span className="text-2xl font-bold font-mono text-slate-100">{value}</span>
    <span className="text-sm text-slate-300">{label}</span>
    {sub && <span className="text-xs text-slate-500">{sub}</span>}
  </div>
);

// ─── Section wrapper ──────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="bg-slate-900 border border-slate-800 rounded-lg p-5">
    <h2 className="text-base font-semibold text-slate-200 mb-4">{title}</h2>
    {children}
  </section>
);

// ─── Empty state ──────────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <div className="text-center py-16">
    <div className="text-5xl mb-4">🛡️</div>
    <p className="text-slate-300 font-medium mb-2">No events recorded yet</p>
    <p className="text-slate-500 text-sm max-w-md mx-auto">
      Events appear here after VeilGuard checks a message. Visit the mock AI
      site (or any supported site) and send a prompt — the review screen will
      appear, and the outcome will be recorded here.
    </p>
  </div>
);

// ─── CSV / JSON export helpers (whitelisted fields only) ──────────────────────

const EXPORT_KEYS: Array<keyof StoredEvent> = [
  "timestamp",
  "destination",
  "profile",
  "decision",
  "user_choice",
  "rule_ids",
  "category_counts",
  "entity_count",
  "latency_ms",
  "source",
  "outcome",
];

function exportToJSON(events: StoredEvent[]): void {
  const safe = events.map((ev) => {
    const out: Partial<StoredEvent> = {};
    for (const k of EXPORT_KEYS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- key indexing on a typed object
      (out as any)[k] = ev[k];
    }
    return out;
  });
  const blob = new Blob([JSON.stringify(safe, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `veilguard-events-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToCSV(events: StoredEvent[]): void {
  const header = EXPORT_KEYS.join(",");
  const rows = events.map((ev) =>
    EXPORT_KEYS.map((k) => {
      const val = ev[k];
      if (Array.isArray(val)) return `"${val.join(";")}"`;
      if (typeof val === "object" && val !== null)
        return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      return `"${String(val ?? "").replace(/"/g, '""')}"`;
    }).join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], {
    type: "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `veilguard-events-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Time range helper ────────────────────────────────────────────────────────

function sinceForRange(range: TimeRange): string | undefined {
  if (range === "all") return undefined;
  const now = new Date();
  if (range === "24h") {
    now.setHours(now.getHours() - 24);
  } else {
    now.setDate(now.getDate() - 7);
  }
  return now.toISOString();
}

// ─── Dashboard tab ────────────────────────────────────────────────────────────

interface DashboardTabProps {
  events: StoredEvent[];
  ruleReasons: Record<string, string>;
  engineReachable: boolean;
}

const DashboardTab: React.FC<DashboardTabProps> = ({
  events,
  ruleReasons,
  engineReachable,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [filterDestination, setFilterDestination] = useState<string>("all");
  const [filterProfile, setFilterProfile] = useState<string>("all");
  const [filterDecision, setFilterDecision] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [clearPending, setClearPending] = useState(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  // Load pause switch state
  useEffect(() => {
    chrome.storage.local.get(RECORD_HISTORY_KEY, (res) => {
      const v = res[RECORD_HISTORY_KEY];
      // Default true if not set
      setPaused(v === false);
    });
  }, []);

  const handleTogglePause = () => {
    const newPaused = !paused;
    setPauseLoading(true);
    chrome.storage.local.set({ [RECORD_HISTORY_KEY]: !newPaused }, () => {
      setPaused(newPaused);
      setPauseLoading(false);
    });
  };

  const handleClearHistory = () => {
    if (!clearPending) {
      setClearPending(true);
      return;
    }
    chrome.runtime.sendMessage({ type: "CLEAR_EVENTS" }, () => {
      // Direct storage clear as a fallback — background may not handle CLEAR_EVENTS yet
      chrome.storage.local.remove(["vg_events", "vg_audit_log"], () => {
        setClearPending(false);
        window.location.reload();
      });
    });
  };

  const handleCancelClear = () => setClearPending(false);

  // Build filter
  const filter: EventFilter = useMemo(
    () => ({
      since: sinceForRange(timeRange),
      destination: filterDestination !== "all" ? filterDestination : undefined,
      profile: filterProfile !== "all" ? filterProfile : undefined,
      // Cast needed because "all" is not a valid EventDecision
      decision:
        filterDecision !== "all"
          ? (filterDecision as EventFilter["decision"])
          : undefined,
    }),
    [timeRange, filterDestination, filterProfile, filterDecision]
  );

  const summary: SummaryResult = useMemo(
    () => summarize(events as unknown[], filter),
    [events, filter]
  );

  const { validEvents: allValidEvents } = useMemo(
    () => filterEvents(events as unknown[], {}),
    [events]
  );

  const { validEvents: filteredEvents } = useMemo(
    () => filterEvents(events as unknown[], filter),
    [events, filter]
  );

  // Unique values for filter dropdowns (derived from clean valid events)
  const destinations = useMemo(
    () => Array.from(new Set(allValidEvents.map((e) => e.destination))).sort(),
    [allValidEvents]
  );
  const profiles = useMemo(
    () => Array.from(new Set(allValidEvents.map((e) => e.profile))).sort(),
    [allValidEvents]
  );

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE));
  const visibleEvents = useMemo(() => {
    const reversed = [...filteredEvents].reverse(); // newest first
    return reversed.slice(
      (page - 1) * EVENTS_PER_PAGE,
      page * EVENTS_PER_PAGE
    );
  }, [filteredEvents, page]);

  // Reset page when filters change
  const prevFilter = useRef(filter);
  useEffect(() => {
    if (prevFilter.current !== filter) {
      setPage(1);
      prevFilter.current = filter;
    }
  }, [filter]);

  // Decision bar chart entries
  const decisionEntries = (["allow", "redact", "require_approval", "block"] as const).map(
    (d) => ({
      label: DECISION_LABELS[d] ?? d,
      value: summary.totals.by_decision[d] ?? 0,
      color: DECISION_COLORS[d] ?? "#64748b",
    })
  );

  // User choice bar chart entries
  const choiceEntries = Object.entries(USER_CHOICE_LABELS).map(
    ([k, label]) => ({
      label,
      value: summary.totals.by_user_choice[k as keyof typeof summary.totals.by_user_choice] ?? 0,
      color: USER_CHOICE_COLORS[k] ?? "#64748b",
    })
  );

  // Category bar chart entries
  const categoryEntries = Object.entries(summary.counts_by_category)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({
      label: cat,
      value: count,
      color: "#a78bfa",
    }));

  // Rules fired
  const rulesEntries = Object.entries(summary.counts_by_rule_id)
    .sort((a, b) => b[1] - a[1])
    .map(([ruleId, count]) => ({
      ruleId,
      count,
      reason: ruleReasons[ruleId] ?? (engineReachable ? "" : "reason unavailable (engine not reachable)"),
    }));

  return (
    <div className="space-y-6">
      {/* ── Controls: time range, filters, export, clear, pause ── */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-wrap items-start gap-4">
          {/* Time range */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Time range</label>
            <div className="flex gap-1" role="group" aria-label="Time range">
              {(["24h", "7d", "all"] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setTimeRange(r)}
                  aria-pressed={timeRange === r}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
                    timeRange === r
                      ? "bg-sky-700 text-white"
                      : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {r === "all" ? "All time" : `Last ${r}`}
                </button>
              ))}
            </div>
          </div>

          {/* Destination filter */}
          {destinations.length > 0 && (
            <div>
              <label htmlFor="filter-dest" className="text-xs text-slate-400 block mb-1">
                Destination
              </label>
              <select
                id="filter-dest"
                value={filterDestination}
                onChange={(e) => setFilterDestination(e.target.value)}
                className="px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:border-sky-500 focus:outline-none"
              >
                <option value="all">All destinations</option>
                {destinations.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Profile filter */}
          {profiles.length > 1 && (
            <div>
              <label htmlFor="filter-profile" className="text-xs text-slate-400 block mb-1">
                Profile
              </label>
              <select
                id="filter-profile"
                value={filterProfile}
                onChange={(e) => setFilterProfile(e.target.value)}
                className="px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:border-sky-500 focus:outline-none"
              >
                <option value="all">All profiles</option>
                {profiles.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Decision filter */}
          <div>
            <label htmlFor="filter-decision" className="text-xs text-slate-400 block mb-1">
              Decision tier
            </label>
            <select
              id="filter-decision"
              value={filterDecision}
              onChange={(e) => setFilterDecision(e.target.value)}
              className="px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:border-sky-500 focus:outline-none"
            >
              <option value="all">All decisions</option>
              <option value="allow">No sensitive content found</option>
              <option value="redact">Sensitive (redact)</option>
              <option value="require_approval">Needs your decision</option>
              <option value="block">Blocked</option>
            </select>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Export buttons */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Export (whitelisted fields)</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => exportToJSON(filteredEvents)}
                disabled={filteredEvents.length === 0}
                className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={() => exportToCSV(filteredEvents)}
                disabled={filteredEvents.length === 0}
                className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
              >
                CSV
              </button>
            </div>
          </div>

          {/* Clear history */}
          <div>
            <p className="text-xs text-slate-400 mb-1">History</p>
            <div className="flex gap-2 items-center">
              {clearPending ? (
                <>
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-xs text-white font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                    aria-label="Confirm clear all history"
                  >
                    Confirm clear
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelClear}
                    className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  Clear history
                </button>
              )}
            </div>
          </div>

          {/* Pause switch */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Recording</p>
            <button
              type="button"
              onClick={handleTogglePause}
              disabled={pauseLoading}
              role="switch"
              aria-checked={!paused}
              aria-label="Pause recording (protection stays on)"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50 ${
                paused ? "bg-slate-600" : "bg-sky-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  paused ? "translate-x-1" : "translate-x-6"
                }`}
              />
            </button>
            <p className="text-xs text-slate-500 mt-1 max-w-[120px]">
              {paused ? "Paused — protection still on" : "Recording active"}
            </p>
          </div>
        </div>

        {summary.skipped > 0 && (
          <p
            className="mt-3 text-xs text-amber-400"
            aria-live="polite"
            role="status"
          >
            ⚠ {summary.skipped} malformed event{summary.skipped > 1 ? "s" : ""}{" "}
            in storage were skipped and are not counted.
          </p>
        )}
      </section>

      {allValidEvents.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* 1. Summary cards */}
          <Section title="Messages checked">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Checked" value={summary.totals.checked} />
          <SummaryCard
            label="Sent unchanged"
            value={summary.totals.by_user_choice.auto_allowed}
            sub="no sensitive content"
          />
          <SummaryCard
            label="Sent sanitized"
            value={summary.totals.by_user_choice.sent_sanitized}
          />
          <SummaryCard
            label="Blocked or cancelled"
            value={
              (summary.totals.by_user_choice.blocked ?? 0) +
              (summary.totals.by_user_choice.cancelled ?? 0)
            }
          />
          <SummaryCard
            label="Engine blocked"
            value={summary.totals.by_user_choice.failed_closed}
            sub="fail-closed events"
          />
          <SummaryCard
            label="Documents scanned"
            value={0}
            sub="not available yet"
          />
        </div>
      </Section>

      {/* 2. Decision tiers */}
      <Section title="Decision tiers">
        <BarChart
          entries={decisionEntries}
          ariaLabel="Distribution of engine decision tiers"
        />
      </Section>

      {/* 3. User actions */}
      <Section title="What you did">
        <BarChart
          entries={choiceEntries}
          ariaLabel="Distribution of user actions after review"
        />
      </Section>

      {/* 4. Sensitive info by category */}
      {categoryEntries.length > 0 && (
        <Section title="Sensitive information by category">
          <BarChart
            entries={categoryEntries}
            ariaLabel="Sensitive entity categories detected"
          />
        </Section>
      )}

      {/* 5. Rules that fired */}
      {rulesEntries.length > 0 && (
        <Section title="Policy rules that fired">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left" aria-label="Policy rules that fired">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-800">
                  <th className="pb-2 pr-4 font-medium">Rule ID</th>
                  <th className="pb-2 pr-4 font-medium text-right">Times fired</th>
                  <th className="pb-2 font-medium">Plain-language reason</th>
                </tr>
              </thead>
              <tbody>
                {rulesEntries.map(({ ruleId, count, reason }) => (
                  <tr key={ruleId} className="border-b border-slate-800/50">
                    <td className="py-2 pr-4 font-mono text-xs text-sky-300">{ruleId}</td>
                    <td className="py-2 pr-4 text-right text-slate-200 font-mono">{count}</td>
                    <td className="py-2 text-slate-400 text-xs">
                      {reason || (engineReachable ? <em>no description</em> : <em>reason unavailable (engine not reachable)</em>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* 6. Activity over last 14 days */}
      <Section title="Activity — last 14 days">
        <ActivityBars data={summary.activity_last_14_days} />
      </Section>

      {/* 7. Observed latency */}
      <Section title="Observed engine latency">
        <p className="text-xs text-slate-500 mb-3">
          Recorded on this device only. Not a benchmark.
        </p>
        <div className="flex gap-8">
          <div>
            <span className="text-2xl font-bold font-mono text-slate-100">
              {summary.latency.median === 0 ? "—" : `${Math.round(summary.latency.median)} ms`}
            </span>
            <p className="text-xs text-slate-400 mt-0.5">Median (p50)</p>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono text-slate-100">
              {summary.latency.p95 === 0 ? "—" : `${Math.round(summary.latency.p95)} ms`}
            </span>
            <p className="text-xs text-slate-400 mt-0.5">p95</p>
          </div>
        </div>
      </Section>

      {/* 8. Benchmark panel */}
      <Section title="Benchmark results">
        {benchmarkSummaryData && benchmarkSummaryData.systems && benchmarkSummaryData.systems.length > 0 ? (
          <div className="space-y-3">
            <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
              <span><strong className="text-slate-300">Dataset:</strong> {benchmarkSummaryData.dataset_size} items</span>
              <span><strong className="text-slate-300">Date:</strong> {benchmarkSummaryData.date}</span>
              <span><strong className="text-slate-300">Commit:</strong> <code className="text-sky-400">{benchmarkSummaryData.commit}</code></span>
              <span><strong className="text-slate-300">Run #:</strong> {benchmarkSummaryData.run_number}</span>
            </div>
            <p className="text-xs text-amber-400/90 italic">
              ⚠ {benchmarkSummaryData.caveat}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left" aria-label="Benchmark results">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="pb-2 pr-3 font-medium">System</th>
                    <th className="pb-2 pr-3 font-medium text-right">Entity F1</th>
                    <th className="pb-2 pr-3 font-medium text-right">Flagged Recall</th>
                    <th className="pb-2 pr-3 font-medium text-right">Combo Recall</th>
                    <th className="pb-2 font-medium text-right">p50 Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarkSummaryData.systems.map((s) => (
                    <tr key={s.name} className="border-b border-slate-800/40">
                      <td className="py-1.5 pr-3 font-mono text-slate-300">{s.name}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-200">{s.entity_f1}%</td>
                      <td className="py-1.5 pr-3 text-right text-slate-200">{s.flagged_recall}%</td>
                      <td className="py-1.5 pr-3 text-right text-slate-200">{s.combo_recall}%</td>
                      <td className="py-1.5 text-right font-mono text-slate-400">{s.p50_latency_ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 text-sm italic">
            No benchmark results are bundled yet. This panel will display
            detection accuracy statistics from the benchmark run.
          </p>
        )}
      </Section>

      {/* 9. Recent events table */}
      <Section title={`Recent events (${filteredEvents.length} total)`}>
        {filteredEvents.length === 0 ? (
          <p className="text-slate-500 text-sm">No events match the current filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table
                className="w-full text-xs text-left"
                aria-label="Recent events"
              >
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="pb-2 pr-3 font-medium">Time</th>
                    <th className="pb-2 pr-3 font-medium">Destination</th>
                    <th className="pb-2 pr-3 font-medium">Profile</th>
                    <th className="pb-2 pr-3 font-medium">Decision</th>
                    <th className="pb-2 pr-3 font-medium">User action</th>
                    <th className="pb-2 pr-3 font-medium">Categories</th>
                    <th className="pb-2 pr-3 font-medium">Rule IDs</th>
                    <th className="pb-2 font-medium text-right">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((ev, i) => (
                    <tr
                      key={`${ev.timestamp}-${i}`}
                      className="border-b border-slate-800/40 hover:bg-slate-800/30"
                    >
                      <td className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">
                        {new Date(ev.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-300 max-w-[120px] truncate" title={ev.destination}>
                        {ev.destination}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-300">{ev.profile}</td>
                      <td className="py-1.5 pr-3">
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            backgroundColor: `${DECISION_COLORS[ev.decision] ?? "#64748b"}22`,
                            color: DECISION_COLORS[ev.decision] ?? "#94a3b8",
                          }}
                        >
                          {ev.decision}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-slate-400 max-w-[140px] truncate" title={ev.user_choice}>
                        {USER_CHOICE_LABELS[ev.user_choice] ?? ev.user_choice}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-400 max-w-[120px] truncate" title={Object.keys(ev.category_counts).join(", ")}>
                        {Object.keys(ev.category_counts).join(", ") || "—"}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-slate-500 max-w-[180px] truncate" title={ev.rule_ids.join(", ")}>
                        {ev.rule_ids.join(", ") || "—"}
                      </td>
                      <td className="py-1.5 text-right font-mono text-slate-400 whitespace-nowrap">
                        {ev.latency_ms > 0 ? `${Math.round(ev.latency_ms)} ms` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 disabled:opacity-40 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                  aria-label="Previous page"
                >
                  ← Previous
                </button>
                <span className="text-xs text-slate-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 disabled:opacity-40 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                  aria-label="Next page"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </Section>

      {/* 10. Footnote */}
      <p className="text-xs text-slate-600 text-center pb-4">
        Counts describe activity on this device. They are not a measure of
        detection accuracy.
      </p>
        </>
      )}
    </div>
  );
};

// ─── Settings tab ─────────────────────────────────────────────────────────────

interface SettingsTabProps {
  onProfilesLoaded: (profiles: string[], ruleReasons: Record<string, string>) => void;
}

const SettingsTab: React.FC<SettingsTabProps> = ({ onProfilesLoaded }) => {
  const [token, setToken] = useState<string>("");
  const [savedToken, setSavedToken] = useState<string>("");
  const [profile, setProfile] = useState<string>("company");
  const [profiles, setProfiles] = useState<string[]>(["company"]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("idle");
  const [connDetail, setConnDetail] = useState<string>("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [vaultCleared, setVaultCleared] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(["vg_token", "vg_profile"], (result) => {
      const t =
        typeof result["vg_token"] === "string" ? (result["vg_token"] as string) : "";
      const p =
        typeof result["vg_profile"] === "string"
          ? (result["vg_profile"] as string)
          : "company";
      setSavedToken(t);
      setToken(t);
      setProfile(p);
    });
  }, []);

  const loadProfiles = useCallback(() => {
    setProfilesLoading(true);
    chrome.runtime.sendMessage(
      { type: "FETCH_PROFILES" },
      (response: ProfilesMsg) => {
        setProfilesLoading(false);
        if (chrome.runtime.lastError) return;
        if (
          response?.ok &&
          Array.isArray(response.profiles) &&
          response.profiles.length > 0
        ) {
          setProfiles(response.profiles);
          onProfilesLoaded(
            response.profiles,
            response.ruleReasons ?? {}
          );
        }
      }
    );
  }, [onProfilesLoaded]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleSaveToken = () => {
    const trimmed = token.trim();
    chrome.storage.local.set({ vg_token: trimmed }, () => {
      setSavedToken(trimmed);
      setTokenSaved(true);
      setTimeout(() => setTokenSaved(false), 2500);
      loadProfiles();
    });
  };

  const handleSaveProfile = (newProfile: string) => {
    setProfile(newProfile);
    chrome.storage.local.set({ vg_profile: newProfile });
  };

  const handleTestConnection = () => {
    setConnStatus("checking");
    setConnDetail("");
    chrome.runtime.sendMessage({ type: "PING" }, (response: PingMsg) => {
      if (chrome.runtime.lastError) {
        setConnStatus("error");
        setConnDetail(chrome.runtime.lastError.message ?? "Extension error");
        return;
      }
      if (response?.ok) {
        setConnStatus("ok");
        const v = response.health?.version ? ` v${response.health.version}` : "";
        setConnDetail(`Engine online${v}`);
      } else {
        setConnStatus("error");
        const kind = response?.errorKind ?? "unknown";
        const msg = response?.errorMessage ?? "Unknown error";
        setConnDetail(
          kind === "auth_error"
            ? "Token rejected (401) — check your token."
            : msg
        );
      }
    });
  };

  const handleClearVault = () => {
    chrome.tabs.query({}, (tabs) => {
      const promises = tabs
        .filter((t) => t.id != null)
        .map(
          (t) =>
            new Promise<void>((resolve) => {
              chrome.runtime.sendMessage(
                { type: "VAULT_CLEAR", tabId: t.id! },
                () => resolve()
              );
            })
        );
      Promise.all(promises).then(() => {
        setVaultCleared(true);
        setTimeout(() => setVaultCleared(false), 2500);
      });
    });
  };

  const statusColor: Record<ConnectionStatus, string> = {
    idle: "bg-slate-500",
    checking: "bg-amber-400 animate-pulse",
    ok: "bg-emerald-400",
    error: "bg-red-500",
  };
  const statusLabel: Record<ConnectionStatus, string> = {
    idle: "Not tested",
    checking: "Checking…",
    ok: "Connected",
    error: "Error",
  };

  const tokenMasked =
    savedToken.length > 0
      ? `${savedToken.substring(0, 4)}${"•".repeat(
          Math.min(savedToken.length - 4, 20)
        )}`
      : "(none)";

  return (
    <div className="space-y-6">
      {/* Engine Connectivity */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">Engine Connectivity</h2>
        <div className="flex items-center gap-3 mb-4">
          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${statusColor[connStatus]}`} />
          <span className="text-sm text-slate-300">
            {statusLabel[connStatus]}
            {connDetail && (
              <span
                className={`ml-2 text-xs ${
                  connStatus === "error" ? "text-red-400" : "text-emerald-400"
                }`}
              >
                — {connDetail}
              </span>
            )}
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Target:{" "}
          <code>http://127.0.0.1:8765/health</code> — must be running for
          protection to be active.
        </p>
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={connStatus === "checking"}
          className="px-4 py-2 rounded-md bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          {connStatus === "checking" ? "Testing…" : "Test Connection"}
        </button>
      </section>

      {/* Bearer Token */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-1">Bearer Token</h2>
        <p className="text-xs text-slate-500 mb-4">
          Found in <code>.veilguard/token</code> in the engine directory.
          Never share or commit this value.
        </p>
        {savedToken.length > 0 && (
          <p className="text-xs text-slate-400 mb-3">
            Stored token: <code className="font-mono">{tokenMasked}</code>
          </p>
        )}
        <div className="flex gap-3 items-center">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your VeilGuard bearer token"
            autoComplete="new-password"
            aria-label="Bearer token"
            className="flex-1 px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm font-mono focus:border-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          />
          <button
            type="button"
            onClick={handleSaveToken}
            className="px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            {tokenSaved ? "Saved ✓" : "Save Token"}
          </button>
        </div>
      </section>

      {/* Policy Profile */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-1">Policy Profile</h2>
        <p className="text-xs text-slate-500 mb-4">
          Controls which ruleset is applied to analyzed submissions.
        </p>
        <div className="flex gap-3 items-center">
          <select
            value={profile}
            onChange={(e) => handleSaveProfile(e.target.value)}
            disabled={profilesLoading}
            aria-label="Active policy profile"
            className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
          >
            {profiles.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadProfiles}
            disabled={profilesLoading}
            className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            {profilesLoading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </section>

      {/* Session Vault */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-1">Session Vault</h2>
        <p className="text-sm text-slate-400 mb-4">
          The session vault stores pseudonymization placeholder mappings (e.g.{" "}
          <code className="text-xs bg-slate-800 px-1 rounded">
            PERSON → [PERSON_1]
          </code>
          ) to keep replacements consistent across conversation turns. It holds{" "}
          <strong>entity type and placeholder only</strong> — no raw message
          content. The vault is automatically cleared when browser tabs are
          closed.
        </p>
        <button
          type="button"
          onClick={handleClearVault}
          className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          {vaultCleared ? "Vault Cleared ✓" : "Clear All Vaults"}
        </button>
      </section>

      {/* Privacy Notice */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-2">Privacy &amp; Audit Log</h2>
        <p className="text-sm text-slate-400">
          Per Security Rule 7, only metadata is recorded in the audit log:
          timestamps, decision tiers, category counts, entity counts, rule IDs,
          and policy decisions.{" "}
          <strong className="text-amber-400">
            Raw prompt content is never stored.
          </strong>
        </p>
        <p className="text-xs text-slate-500 mt-3">
          Zero external telemetry: no network requests carrying user content
          leave the local boundary (Rule 8). Event history is capped at 1000
          entries.
        </p>
      </section>
    </div>
  );
};

// ─── Root component ───────────────────────────────────────────────────────────

export const Options: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [ruleReasons, setRuleReasons] = useState<Record<string, string>>({});
  const [engineReachable, setEngineReachable] = useState<boolean>(false);
  const [loadTime, setLoadTime] = useState<number>(0);

  const loadEvents = useCallback(() => {
    const t0 = performance.now();
    chrome.storage.local.get(EVENTS_STORAGE_KEY, (result) => {
      const raw = result[EVENTS_STORAGE_KEY];
      setLoadTime(Math.round(performance.now() - t0));
      setEvents(Array.isArray(raw) ? (raw as unknown[] as StoredEvent[]) : []);
    });
  }, []);

  useEffect(() => {
    loadEvents();
    // Reload events if storage changes (e.g., after a new flow)
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (EVENTS_STORAGE_KEY in changes) {
        loadEvents();
      }
    };
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, [loadEvents]);

  // Check engine reachability for rule reason display
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "PING" }, (response: PingMsg) => {
      if (!chrome.runtime.lastError && response?.ok) {
        setEngineReachable(true);
      }
    });
  }, []);

  const handleProfilesLoaded = useCallback(
    (p: string[], reasons: Record<string, string>) => {
      setRuleReasons(reasons);
      setEngineReachable(true);
      void p; // used by SettingsTab for dropdown, not needed here
    },
    []
  );

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 font-sans"
      style={{ colorScheme: "dark" }}
    >
      {/* Header */}
      <header className="border-b border-slate-800 px-8 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-sky-400">VeilGuard AI</h1>
            <p className="text-xs text-slate-500">
              Privacy firewall — metadata dashboard
            </p>
          </div>
          {/* Tab switcher */}
          <nav
            className="flex gap-1 bg-slate-900 rounded-lg p-1"
            role="tablist"
            aria-label="Options sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
                activeTab === "dashboard"
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Dashboard
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "settings"}
              onClick={() => setActiveTab("settings")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
                activeTab === "settings"
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Settings
            </button>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-8 py-6">
        {activeTab === "dashboard" ? (
          <>
            {events.length > 0 && loadTime > 0 && (
              <p className="text-xs text-slate-600 mb-4">
                {events.length} event{events.length !== 1 ? "s" : ""} loaded in{" "}
                {loadTime} ms
              </p>
            )}
            <DashboardTab
              events={events}
              ruleReasons={ruleReasons}
              engineReachable={engineReachable}
            />
          </>
        ) : (
          <SettingsTab onProfilesLoaded={handleProfilesLoaded} />
        )}
      </main>
    </div>
  );
};
