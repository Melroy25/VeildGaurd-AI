/**
 * VeilGuard AI - Pure Event Aggregation & Statistics
 *
 * Implements pure, browser-independent aggregation logic for the privacy dashboard.
 *
 * Requirements & Invariants:
 *  - Pure functions: no DOM, no chrome.* APIs, zero side-effects.
 *  - Nearest-rank percentiles for latency (median, p95).
 *  - 14-day activity series with zero-filled gaps.
 *  - Tolerant of malformed inputs: invalid events are counted in `skipped` and never crash.
 *  - Strictly metadata-only fields.
 */

import {
  sanitizeEvent,
  type StoredEvent,
  type EventDecision,
  type EventUserChoice,
  type EventSource,
} from "../background/events-store";

export interface EventFilter {
  since?: string | Date;
  destination?: string;
  profile?: string;
  decision?: EventDecision;
  referenceDate?: Date; // Optional reference date for deterministic day bucketing in tests
}

export interface DayActivity {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface LatencyStats {
  median: number;
  p95: number;
}

export interface SummaryResult {
  totals: {
    checked: number;
    by_decision: Record<EventDecision, number>;
    by_user_choice: Record<EventUserChoice, number>;
    by_source: Record<EventSource, number>;
  };
  counts_by_category: Record<string, number>;
  counts_by_rule_id: Record<string, number>;
  activity_last_14_days: DayActivity[];
  latency: LatencyStats;
  skipped: number;
}

/**
 * Calculates a percentile using the nearest-rank method (NIST / Wikipedia standard).
 *
 * For a sorted list of N numbers and percentile P (0-100):
 *   rank r = ceil((P / 100) * N)
 *   0-indexed index = max(0, min(N - 1, r - 1))
 *
 * Handled edge cases:
 *   N = 0 -> 0
 *   N = 1 -> values[0]
 */
export function calculateNearestRankPercentile(sortedValues: number[], percentile: number): number {
  const n = sortedValues.length;
  if (n === 0) return 0;
  if (n === 1) return sortedValues[0];

  const rank = Math.ceil((percentile / 100) * n);
  const index = Math.max(0, Math.min(n - 1, rank - 1));
  return sortedValues[index];
}

/**
 * Formats a Date object to YYYY-MM-DD in local time.
 */
export function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Generates an array of the last 14 days up to refDate with zero counts.
 */
function build14DaySkeleton(refDate: Date): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(refDate.getTime());
    d.setDate(d.getDate() - i);
    map.set(formatLocalDate(d), 0);
  }
  return map;
}

/**
 * Aggregates a list of events into dashboard summary metrics.
 * Safely ignores and counts malformed events without throwing.
 */
export function summarize(
  rawEvents: unknown[],
  filter: EventFilter = {}
): SummaryResult {
  let skipped = 0;
  const validEvents: StoredEvent[] = [];

  const sinceTime = filter.since ? new Date(filter.since).getTime() : null;
  const refDate = filter.referenceDate || new Date();

  // Validate and filter
  if (Array.isArray(rawEvents)) {
    for (const item of rawEvents) {
      const clean = sanitizeEvent(item);
      if (!clean) {
        skipped++;
        continue;
      }

      // Filter by time window
      if (sinceTime !== null && !Number.isNaN(sinceTime)) {
        const itemTime = new Date(clean.timestamp).getTime();
        if (itemTime < sinceTime) {
          continue;
        }
      }

      // Filter by destination
      if (filter.destination && filter.destination !== "all") {
        if (clean.destination.toLowerCase() !== filter.destination.toLowerCase()) {
          continue;
        }
      }

      // Filter by profile
      if (filter.profile && filter.profile !== "all") {
        if (clean.profile !== filter.profile) {
          continue;
        }
      }

      // Filter by decision
      if (filter.decision && filter.decision !== ("all" as unknown as EventDecision)) {
        if (clean.decision !== filter.decision) {
          continue;
        }
      }

      validEvents.push(clean);
    }
  }

  // Initialize aggregates
  const by_decision: Record<EventDecision, number> = {
    allow: 0,
    redact: 0,
    require_approval: 0,
    block: 0,
  };

  const by_user_choice: Record<EventUserChoice, number> = {
    sent_sanitized: 0,
    sent_original: 0,
    edited: 0,
    cancelled: 0,
    failed_closed: 0,
    auto_allowed: 0,
    blocked: 0,
  };

  const by_source: Record<EventSource, number> = {
    prompt: 0,
    document: 0,
  };

  const counts_by_category: Record<string, number> = {};
  const counts_by_rule_id: Record<string, number> = {};
  const dayMap = build14DaySkeleton(refDate);
  const latencies: number[] = [];

  // Compute metrics
  for (const ev of validEvents) {
    // Decisions
    if (by_decision[ev.decision] !== undefined) {
      by_decision[ev.decision]++;
    }

    // User choices
    if (by_user_choice[ev.user_choice] !== undefined) {
      by_user_choice[ev.user_choice]++;
    }

    // Source
    if (by_source[ev.source] !== undefined) {
      by_source[ev.source]++;
    }

    // Category counts
    for (const [cat, count] of Object.entries(ev.category_counts)) {
      counts_by_category[cat] = (counts_by_category[cat] || 0) + count;
    }

    // Rule IDs
    for (const rule of ev.rule_ids) {
      counts_by_rule_id[rule] = (counts_by_rule_id[rule] || 0) + 1;
    }

    // Day bucketing (in local time)
    const evDateStr = formatLocalDate(new Date(ev.timestamp));
    if (dayMap.has(evDateStr)) {
      dayMap.set(evDateStr, (dayMap.get(evDateStr) || 0) + 1);
    }

    // Latency
    if (ev.latency_ms > 0) {
      latencies.push(ev.latency_ms);
    }
  }

  // Latency percentiles
  latencies.sort((a, b) => a - b);
  const median = calculateNearestRankPercentile(latencies, 50);
  const p95 = calculateNearestRankPercentile(latencies, 95);

  const activity_last_14_days: DayActivity[] = Array.from(dayMap.entries()).map(([date, count]) => ({
    date,
    count,
  }));

  return {
    totals: {
      checked: validEvents.length,
      by_decision,
      by_user_choice,
      by_source,
    },
    counts_by_category,
    counts_by_rule_id,
    activity_last_14_days,
    latency: {
      median,
      p95,
    },
    skipped,
  };
}
