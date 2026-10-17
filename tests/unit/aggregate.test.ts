import { describe, it, expect } from "vitest";
import {
  summarize,
  calculateNearestRankPercentile,
  formatLocalDate,
} from "../../extension/src/shared/aggregate";
import type { StoredEvent } from "../../extension/src/background/events-store";

describe("aggregate: calculateNearestRankPercentile", () => {
  it("handles N=0", () => {
    expect(calculateNearestRankPercentile([], 50)).toBe(0);
    expect(calculateNearestRankPercentile([], 95)).toBe(0);
  });

  it("handles N=1", () => {
    expect(calculateNearestRankPercentile([42], 50)).toBe(42);
    expect(calculateNearestRankPercentile([42], 95)).toBe(42);
  });

  it("handles N=2", () => {
    // sorted: [10, 20]
    // 50th percentile: rank = ceil(0.5 * 2) = 1 -> index 0 (10)
    // 95th percentile: rank = ceil(0.95 * 2) = 2 -> index 1 (20)
    expect(calculateNearestRankPercentile([10, 20], 50)).toBe(10);
    expect(calculateNearestRankPercentile([10, 20], 95)).toBe(20);
  });

  it("handles N=100", () => {
    // Array of 1 to 100: [1, 2, ..., 100]
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    // 50th percentile: rank = ceil(0.50 * 100) = 50 -> index 49 (value 50)
    // 95th percentile: rank = ceil(0.95 * 100) = 95 -> index 94 (value 95)
    expect(calculateNearestRankPercentile(values, 50)).toBe(50);
    expect(calculateNearestRankPercentile(values, 95)).toBe(95);
  });
});

describe("aggregate: summarize", () => {
  const fixedRefDate = new Date("2026-10-17T12:00:00.000Z");

  it("handles empty input", () => {
    const res = summarize([], { referenceDate: fixedRefDate });
    expect(res.totals.checked).toBe(0);
    expect(res.totals.by_decision.allow).toBe(0);
    expect(res.totals.by_decision.redact).toBe(0);
    expect(res.totals.by_decision.require_approval).toBe(0);
    expect(res.totals.by_decision.block).toBe(0);
    expect(res.totals.by_source.prompt).toBe(0);
    expect(res.totals.by_source.document).toBe(0);
    expect(res.latency.median).toBe(0);
    expect(res.latency.p95).toBe(0);
    expect(res.skipped).toBe(0);
    expect(res.activity_last_14_days.length).toBe(14);
    expect(res.activity_last_14_days.every((d) => d.count === 0)).toBe(true);
  });

  it("handles one valid event", () => {
    const ev: StoredEvent = {
      timestamp: "2026-10-17T08:00:00.000Z",
      destination: "127.0.0.1",
      profile: "company",
      decision: "redact",
      user_choice: "sent_sanitized",
      rule_ids: ["PII_COMBINATION_PERSON"],
      category_counts: { PII: 2 },
      entity_count: 2,
      latency_ms: 150,
      source: "prompt",
      outcome: "user_approved",
    };

    const res = summarize([ev], { referenceDate: fixedRefDate });
    expect(res.totals.checked).toBe(1);
    expect(res.totals.by_decision.redact).toBe(1);
    expect(res.totals.by_user_choice.sent_sanitized).toBe(1);
    expect(res.totals.by_source.prompt).toBe(1);
    expect(res.counts_by_category["PII"]).toBe(2);
    expect(res.counts_by_rule_id["PII_COMBINATION_PERSON"]).toBe(1);
    expect(res.latency.median).toBe(150);
    expect(res.latency.p95).toBe(150);
    expect(res.skipped).toBe(0);

    const todayStr = formatLocalDate(fixedRefDate);
    const todayItem = res.activity_last_14_days.find((d) => d.date === todayStr);
    expect(todayItem?.count).toBe(1);
  });

  it("skips and counts malformed events without crashing", () => {
    const list = [
      null,
      "invalid-string",
      { bad: "data" },
      { timestamp: "invalid-date", decision: "allow" },
      {
        timestamp: "2026-10-17T08:00:00.000Z",
        destination: "127.0.0.1",
        profile: "company",
        decision: "block",
        user_choice: "blocked",
        rule_ids: ["SECRET_BLOCK"],
        category_counts: { SECRET: 1 },
        entity_count: 1,
        latency_ms: 40,
        source: "prompt",
        outcome: "blocked",
      },
    ];

    const res = summarize(list, { referenceDate: fixedRefDate });
    expect(res.totals.checked).toBe(1);
    expect(res.skipped).toBe(4);
    expect(res.totals.by_decision.block).toBe(1);
  });

  it("aggregates mixed events across multiple decisions and categories", () => {
    const events: StoredEvent[] = [
      {
        timestamp: "2026-10-17T01:00:00.000Z",
        destination: "ai.example.com",
        profile: "company",
        decision: "allow",
        user_choice: "auto_allowed",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 20,
        source: "prompt",
        outcome: "auto_allowed",
      },
      {
        timestamp: "2026-10-17T02:00:00.000Z",
        destination: "ai.example.com",
        profile: "company",
        decision: "redact",
        user_choice: "sent_sanitized",
        rule_ids: ["PII_COMBINATION_PERSON", "REDACT_DIRECT_CONTACT"],
        category_counts: { PII: 1, CONTACT: 1 },
        entity_count: 2,
        latency_ms: 120,
        source: "prompt",
        outcome: "user_approved",
      },
      {
        timestamp: "2026-10-17T03:00:00.000Z",
        destination: "other.ai",
        profile: "personal",
        decision: "require_approval",
        user_choice: "sent_original",
        rule_ids: ["MOBILE_ALONE"],
        category_counts: { PII: 1 },
        entity_count: 1,
        latency_ms: 80,
        source: "prompt",
        outcome: "user_overrode",
      },
      {
        timestamp: "2026-10-17T04:00:00.000Z",
        destination: "ai.example.com",
        profile: "company",
        decision: "block",
        user_choice: "blocked",
        rule_ids: ["SECRET_BLOCK"],
        category_counts: { SECRET: 1 },
        entity_count: 1,
        latency_ms: 30,
        source: "prompt",
        outcome: "blocked",
      },
    ];

    const res = summarize(events, { referenceDate: fixedRefDate });
    expect(res.totals.checked).toBe(4);
    expect(res.totals.by_decision.allow).toBe(1);
    expect(res.totals.by_decision.redact).toBe(1);
    expect(res.totals.by_decision.require_approval).toBe(1);
    expect(res.totals.by_decision.block).toBe(1);

    expect(res.totals.by_user_choice.auto_allowed).toBe(1);
    expect(res.totals.by_user_choice.sent_sanitized).toBe(1);
    expect(res.totals.by_user_choice.sent_original).toBe(1);
    expect(res.totals.by_user_choice.blocked).toBe(1);

    expect(res.counts_by_category["PII"]).toBe(2);
    expect(res.counts_by_category["CONTACT"]).toBe(1);
    expect(res.counts_by_category["SECRET"]).toBe(1);

    expect(res.counts_by_rule_id["PII_COMBINATION_PERSON"]).toBe(1);
    expect(res.counts_by_rule_id["REDACT_DIRECT_CONTACT"]).toBe(1);
    expect(res.counts_by_rule_id["MOBILE_ALONE"]).toBe(1);
    expect(res.counts_by_rule_id["SECRET_BLOCK"]).toBe(1);

    // Latencies: [20, 30, 80, 120]
    // Median (N=4, P=50): rank ceil(0.5*4)=2 -> index 1 -> 30
    // P95 (N=4, P=95): rank ceil(0.95*4)=4 -> index 3 -> 120
    expect(res.latency.median).toBe(30);
    expect(res.latency.p95).toBe(120);
  });

  it("filters correctly by destination", () => {
    const events: StoredEvent[] = [
      {
        timestamp: "2026-10-17T01:00:00.000Z",
        destination: "site-a.com",
        profile: "company",
        decision: "allow",
        user_choice: "auto_allowed",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "auto_allowed",
      },
      {
        timestamp: "2026-10-17T02:00:00.000Z",
        destination: "site-b.com",
        profile: "company",
        decision: "block",
        user_choice: "blocked",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "blocked",
      },
    ];

    const resA = summarize(events, { destination: "site-a.com", referenceDate: fixedRefDate });
    expect(resA.totals.checked).toBe(1);
    expect(resA.totals.by_decision.allow).toBe(1);

    const resB = summarize(events, { destination: "site-b.com", referenceDate: fixedRefDate });
    expect(resB.totals.checked).toBe(1);
    expect(resB.totals.by_decision.block).toBe(1);
  });

  it("filters correctly by profile", () => {
    const events: StoredEvent[] = [
      {
        timestamp: "2026-10-17T01:00:00.000Z",
        destination: "127.0.0.1",
        profile: "company",
        decision: "redact",
        user_choice: "sent_sanitized",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "user_approved",
      },
      {
        timestamp: "2026-10-17T02:00:00.000Z",
        destination: "127.0.0.1",
        profile: "personal",
        decision: "require_approval",
        user_choice: "sent_original",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "user_overrode",
      },
    ];

    const resPersonal = summarize(events, { profile: "personal", referenceDate: fixedRefDate });
    expect(resPersonal.totals.checked).toBe(1);
    expect(resPersonal.totals.by_decision.require_approval).toBe(1);
  });

  it("filters correctly by decision", () => {
    const events: StoredEvent[] = [
      {
        timestamp: "2026-10-17T01:00:00.000Z",
        destination: "127.0.0.1",
        profile: "company",
        decision: "allow",
        user_choice: "auto_allowed",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "auto_allowed",
      },
      {
        timestamp: "2026-10-17T02:00:00.000Z",
        destination: "127.0.0.1",
        profile: "company",
        decision: "redact",
        user_choice: "sent_sanitized",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "user_approved",
      },
    ];

    const resRedact = summarize(events, { decision: "redact", referenceDate: fixedRefDate });
    expect(resRedact.totals.checked).toBe(1);
    expect(resRedact.totals.by_decision.redact).toBe(1);
  });

  it("filters correctly by since time window", () => {
    const t0 = "2026-10-16T12:00:00.000Z";
    const t1 = "2026-10-17T10:00:00.000Z";
    const events: StoredEvent[] = [
      {
        timestamp: t0,
        destination: "127.0.0.1",
        profile: "company",
        decision: "allow",
        user_choice: "auto_allowed",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "auto_allowed",
      },
      {
        timestamp: t1,
        destination: "127.0.0.1",
        profile: "company",
        decision: "redact",
        user_choice: "sent_sanitized",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "user_approved",
      },
    ];

    const resSince = summarize(events, { since: "2026-10-17T00:00:00.000Z", referenceDate: fixedRefDate });
    expect(resSince.totals.checked).toBe(1);
    expect(resSince.totals.by_decision.redact).toBe(1);
  });

  it("day bucketing fills 14-day gaps and assigns events to correct day", () => {
    const today = new Date("2026-10-17T12:00:00.000Z");
    const yesterday = new Date("2026-10-16T12:00:00.000Z");

    const events: StoredEvent[] = [
      {
        timestamp: today.toISOString(),
        destination: "127.0.0.1",
        profile: "company",
        decision: "allow",
        user_choice: "auto_allowed",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "auto_allowed",
      },
      {
        timestamp: today.toISOString(),
        destination: "127.0.0.1",
        profile: "company",
        decision: "redact",
        user_choice: "sent_sanitized",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "user_approved",
      },
      {
        timestamp: yesterday.toISOString(),
        destination: "127.0.0.1",
        profile: "company",
        decision: "block",
        user_choice: "blocked",
        rule_ids: [],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
        outcome: "blocked",
      },
    ];

    const res = summarize(events, { referenceDate: today });
    expect(res.activity_last_14_days.length).toBe(14);

    const todayStr = formatLocalDate(today);
    const yesterdayStr = formatLocalDate(yesterday);

    const todayItem = res.activity_last_14_days.find((d) => d.date === todayStr);
    const yesterdayItem = res.activity_last_14_days.find((d) => d.date === yesterdayStr);

    expect(todayItem?.count).toBe(2);
    expect(yesterdayItem?.count).toBe(1);

    // Other 12 days should have count 0
    const otherDays = res.activity_last_14_days.filter(
      (d) => d.date !== todayStr && d.date !== yesterdayStr
    );
    expect(otherDays.length).toBe(12);
    expect(otherDays.every((d) => d.count === 0)).toBe(true);
  });
});
