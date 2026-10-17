import { describe, it, expect, beforeEach } from "vitest";
import {
  sanitizeEvent,
  EventStore,
  MemoryStorageAdapter,
  RECORD_HISTORY_KEY,
  MAX_STORED_EVENTS,
  type StoredEvent,
} from "../../extension/src/background/events-store";

describe("events-store: sanitizeEvent runtime whitelist", () => {
  it("passes a valid event and preserves only whitelisted fields", () => {
    const raw = {
      timestamp: "2026-10-17T06:00:00.000Z",
      destination: "127.0.0.1",
      profile: "company",
      decision: "redact",
      user_choice: "sent_sanitized",
      rule_ids: ["PII_COMBINATION_PERSON", "REDACT_DIRECT_CONTACT"],
      category_counts: { PII: 2, CONTACT: 1 },
      entity_count: 3,
      latency_ms: 125,
      source: "prompt",
      outcome: "user_approved",
      // Rogue fields that must NEVER be persisted:
      text: "Analyze customer Rahul Sharma, phone 9876543210",
      prompt: "Analyze customer Rahul Sharma, phone 9876543210",
      value: "Rahul Sharma",
      secret: "supersecrettoken",
      token: "secret_12345",
      randomExtraKey: "drop me",
    };

    const sanitized = sanitizeEvent(raw);
    expect(sanitized).not.toBeNull();
    const clean = sanitized as StoredEvent;

    expect(clean.timestamp).toBe("2026-10-17T06:00:00.000Z");
    expect(clean.destination).toBe("127.0.0.1");
    expect(clean.profile).toBe("company");
    expect(clean.decision).toBe("redact");
    expect(clean.user_choice).toBe("sent_sanitized");
    expect(clean.rule_ids).toEqual(["PII_COMBINATION_PERSON", "REDACT_DIRECT_CONTACT"]);
    expect(clean.category_counts).toEqual({ PII: 2, CONTACT: 1 });
    expect(clean.entity_count).toBe(3);
    expect(clean.latency_ms).toBe(125);
    expect(clean.source).toBe("prompt");

    // Assert that NONE of the rogue fields exist on the returned object
    const keys = Object.keys(clean);
    expect(keys.sort()).toEqual([
      "category_counts",
      "decision",
      "destination",
      "entity_count",
      "latency_ms",
      "outcome",
      "profile",
      "rule_ids",
      "source",
      "timestamp",
      "user_choice",
    ]);

    expect((clean as Record<string, unknown>).text).toBeUndefined();
    expect((clean as Record<string, unknown>).prompt).toBeUndefined();
    expect((clean as Record<string, unknown>).value).toBeUndefined();
    expect((clean as Record<string, unknown>).secret).toBeUndefined();
    expect((clean as Record<string, unknown>).token).toBeUndefined();
    expect((clean as Record<string, unknown>).randomExtraKey).toBeUndefined();
  });

  it("rejects non-object or null input", () => {
    expect(sanitizeEvent(null)).toBeNull();
    expect(sanitizeEvent(undefined)).toBeNull();
    expect(sanitizeEvent("not an object")).toBeNull();
    expect(sanitizeEvent(123)).toBeNull();
    expect(sanitizeEvent([1, 2, 3])).toBeNull();
  });

  it("rejects malformed timestamp", () => {
    expect(sanitizeEvent({ timestamp: "invalid-date", decision: "allow" })).toBeNull();
    expect(sanitizeEvent({ timestamp: 1234567, decision: "allow" })).toBeNull();
    expect(sanitizeEvent({ timestamp: "", decision: "allow" })).toBeNull();
  });

  it("rejects malformed destination (urls with path, query, or spaces)", () => {
    const base = {
      timestamp: "2026-10-17T06:00:00.000Z",
      decision: "allow",
      user_choice: "auto_allowed",
    };

    expect(sanitizeEvent({ ...base, destination: "http://example.com/chat" })).toBeNull();
    expect(sanitizeEvent({ ...base, destination: "example.com/api?q=1" })).toBeNull();
    expect(sanitizeEvent({ ...base, destination: "bad hostname with spaces" })).toBeNull();
  });

  it("rejects invalid decision", () => {
    const base = {
      timestamp: "2026-10-17T06:00:00.000Z",
      destination: "example.com",
      decision: "invalid_decision_tier",
    };
    expect(sanitizeEvent(base)).toBeNull();
  });

  it("rejects rule_ids entries containing prose or spaces", () => {
    const raw = {
      timestamp: "2026-10-17T06:00:00.000Z",
      destination: "example.com",
      decision: "redact",
      rule_ids: [
        "VALID_RULE_1",
        "This is an invalid prose sentence that should not be a rule ID",
        "ANOTHER_VALID_RULE",
        "bad rule with spaces",
        "lowercase_is_ok_if_valid", // Wait, uppercase/alphanumeric regex: ^[A-Z0-9_.]{1,64}$
      ],
    };

    const sanitized = sanitizeEvent(raw);
    expect(sanitized).not.toBeNull();
    // Only entries matching ^[A-Z0-9_.]{1,64}$ should be retained
    expect(sanitized?.rule_ids).toEqual(["VALID_RULE_1", "ANOTHER_VALID_RULE"]);
  });

  it("caps rule_ids at maximum 20 entries", () => {
    const thirtyRules = Array.from({ length: 30 }, (_, i) => `RULE_${i}`);
    const raw = {
      timestamp: "2026-10-17T06:00:00.000Z",
      destination: "example.com",
      decision: "allow",
      rule_ids: thirtyRules,
    };
    const sanitized = sanitizeEvent(raw);
    expect(sanitized?.rule_ids.length).toBe(20);
  });

  it("bounds entity_count and latency_ms and drops negative/non-finite numbers", () => {
    const raw = {
      timestamp: "2026-10-17T06:00:00.000Z",
      destination: "example.com",
      decision: "allow",
      entity_count: -10, // negative
      latency_ms: 999999999, // oversized
    };

    const sanitized = sanitizeEvent(raw);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.entity_count).toBe(0);
    expect(sanitized?.latency_ms).toBe(300000); // capped at max 300,000ms
  });
});

describe("events-store: EventStore storage operations", () => {
  let memoryStorage: MemoryStorageAdapter;
  let store: EventStore;

  beforeEach(() => {
    memoryStorage = new MemoryStorageAdapter();
    store = new EventStore(memoryStorage);
  });

  it("appends valid events and retrieves them", async () => {
    const ok = await store.appendEvent({
      timestamp: "2026-10-17T06:00:00.000Z",
      destination: "example.com",
      profile: "company",
      decision: "redact",
      user_choice: "sent_sanitized",
      rule_ids: ["PII_COMBINATION_PERSON"],
      category_counts: { PII: 1 },
      entity_count: 1,
      latency_ms: 45,
      source: "prompt",
    });

    expect(ok).toBe(true);
    const events = await store.getEvents();
    expect(events.length).toBe(1);
    expect(events[0].destination).toBe("example.com");
    expect(events[0].decision).toBe("redact");
  });

  it("rejects appending malformed events", async () => {
    const ok = await store.appendEvent({
      timestamp: "invalid",
      destination: "not valid",
    });
    expect(ok).toBe(false);

    const events = await store.getEvents();
    expect(events.length).toBe(0);
  });

  it("handles 50 concurrent appendEvent calls without data loss or race conditions", async () => {
    const promises: Promise<boolean>[] = [];

    for (let i = 0; i < 50; i++) {
      promises.push(
        store.appendEvent({
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          destination: "example.com",
          profile: "company",
          decision: "allow",
          user_choice: "auto_allowed",
          rule_ids: [`RULE_${i}`],
          category_counts: {},
          entity_count: 0,
          latency_ms: 10 + i,
          source: "prompt",
        })
      );
    }

    const results = await Promise.all(promises);
    expect(results.every((r) => r === true)).toBe(true);

    const stored = await store.getEvents();
    expect(stored.length).toBe(50);

    // Verify ordering is preserved
    for (let i = 0; i < 50; i++) {
      expect(stored[i].rule_ids[0]).toBe(`RULE_${i}`);
    }
  });

  it("respects the 1,000-event ring buffer cap", async () => {
    // Seed 1,050 events
    for (let i = 0; i < 1050; i++) {
      await store.appendEvent({
        timestamp: new Date(1700000000000 + i * 1000).toISOString(),
        destination: "example.com",
        profile: "company",
        decision: "allow",
        user_choice: "auto_allowed",
        rule_ids: [`EVENT_${i}`],
        category_counts: {},
        entity_count: 0,
        latency_ms: 10,
        source: "prompt",
      });
    }

    const stored = await store.getEvents();
    expect(stored.length).toBe(MAX_STORED_EVENTS);
    expect(stored.length).toBe(1000);

    // Oldest 50 events (0..49) must be evicted; newest (50..1049) retained
    expect(stored[0].rule_ids[0]).toBe("EVENT_50");
    expect(stored[stored.length - 1].rule_ids[0]).toBe("EVENT_1049");
  });

  it("pause switch stops recording without throwing", async () => {
    await store.setRecordingEnabled(false);
    expect(await store.isRecordingEnabled()).toBe(false);

    const appended = await store.appendEvent({
      timestamp: "2026-10-17T06:00:00.000Z",
      destination: "example.com",
      profile: "company",
      decision: "block",
      user_choice: "blocked",
      rule_ids: ["SECRET_BLOCK"],
      category_counts: { SECRET: 1 },
      entity_count: 1,
      latency_ms: 20,
      source: "prompt",
    });

    expect(appended).toBe(false);
    const events = await store.getEvents();
    expect(events.length).toBe(0);

    // Re-enabling recording restores event capture
    await store.setRecordingEnabled(true);
    expect(await store.isRecordingEnabled()).toBe(true);

    const appended2 = await store.appendEvent({
      timestamp: "2026-10-17T06:01:00.000Z",
      destination: "example.com",
      profile: "company",
      decision: "block",
      user_choice: "blocked",
      rule_ids: ["SECRET_BLOCK"],
      category_counts: { SECRET: 1 },
      entity_count: 1,
      latency_ms: 20,
      source: "prompt",
    });

    expect(appended2).toBe(true);
    const events2 = await store.getEvents();
    expect(events2.length).toBe(1);
  });

  it("clearEvents empties the storage", async () => {
    await store.appendEvent({
      timestamp: "2026-10-17T06:00:00.000Z",
      destination: "example.com",
      profile: "company",
      decision: "allow",
      user_choice: "auto_allowed",
      rule_ids: [],
      category_counts: {},
      entity_count: 0,
      latency_ms: 15,
      source: "prompt",
    });

    expect((await store.getEvents()).length).toBe(1);
    await store.clearEvents();
    expect((await store.getEvents()).length).toBe(0);
  });

  it("exportEvents returns only whitelisted fields and no raw text", async () => {
    await store.appendEvent({
      timestamp: "2026-10-17T06:00:00.000Z",
      destination: "chat.mock-ai.local",
      profile: "personal",
      decision: "redact",
      user_choice: "sent_sanitized",
      rule_ids: ["REDACT_DIRECT_CONTACT"],
      category_counts: { PII: 1 },
      entity_count: 1,
      latency_ms: 50,
      source: "prompt",
      outcome: "user_approved",
      // Rogue text field injected
      text: "secret raw prompt",
    });

    const exported = await store.exportEvents();
    expect(exported.length).toBe(1);
    const ev = exported[0];
    expect(ev.destination).toBe("chat.mock-ai.local");
    expect(ev.profile).toBe("personal");
    expect((ev as Record<string, unknown>).text).toBeUndefined();
  });
});
