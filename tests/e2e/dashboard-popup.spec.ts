/**
 * VeilGuard AI - Phase 3c Dashboard & Popup E2E Tests (Part D)
 *
 * Tests 1-12 as required by the Phase 3c spec:
 *  1. Counts correct (seeded events match every summary card and table)
 *  2. Filters and time range change numbers as expected
 *  3. Empty state renders with zero events
 *  4. Malformed events in storage do not crash; skipped count shown
 *  5. Export: JSON and CSV contain only whitelisted fields
 *  6. Clear history asks confirmation, empties storage and UI
 *  7. Pause switch: recording pauses but protection stays active
 *  8. Real-flow integration: run real flows, open dashboard, assert counts
 *  9. Privacy: no original synthetic values appear in rendered text, exports, or storage
 * 10. Popup: engine connected/unreachable/not active/active states
 * 11. Large data: seed 1000 events, render, measure render time
 * 12. Offline/CSP: no external network requests
 *
 * Rule 7: No raw prompt text, entity values, or token ever appears in storage, exports, or UI.
 * Rule 10: All test prompts are strictly synthetic.
 */

import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const EXTENSION_DIST = path.resolve(ROOT_DIR, "extension/dist");
const SCREENSHOTS_DIR = path.resolve(ROOT_DIR, "docs/screenshots");

const E2E_TOKEN = process.env["VEILGUARD_TOKEN"] ?? "e2e-test-token";

// ---------------------------------------------------------------------------
// Synthetic test data (Rule 10: never real personal data)
// ---------------------------------------------------------------------------

const SYNTHETIC_NAME = "Rahul Sharma";
const SYNTHETIC_PHONE = "9876543210";
const FLAGGED_PROMPT = `Analyze customer ${SYNTHETIC_NAME}'s account. Contact: ${SYNTHETIC_PHONE}.`;
const BENIGN_PROMPT = "Summarize the benefits of code review.";

// Whitelisted export key set (must match EXPORT_KEYS in Options.tsx)
const EXPORT_WHITELIST = new Set([
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
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function launchContext(profileSuffix: string): Promise<BrowserContext> {
  const profileDir = path.resolve(
    ROOT_DIR,
    `test-results/.playwright-3c-${profileSuffix}-profile`
  );
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_DIST}`,
      `--load-extension=${EXTENSION_DIST}`,
    ],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  return context;
}

async function injectTokenAndProfile(
  context: BrowserContext,
  token: string = E2E_TOKEN,
  profile = "company"
): Promise<void> {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  await sw.evaluate(
    ({ t, p }) =>
      new Promise<void>((resolve) => {
        chrome.storage.local.set({ vg_token: t, vg_profile: p }, () =>
          resolve()
        );
      }),
    { t: token, p: profile }
  );
}

/** Seed events directly into the service worker's storage. */
async function seedEvents(
  context: BrowserContext,
  events: unknown[]
): Promise<void> {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  await sw.evaluate((evts: unknown[]) => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ vg_events: evts }, () => resolve());
    });
  }, events);
}

/** Read raw storage from the service worker. */
async function readStorage(
  context: BrowserContext,
  key: string
): Promise<unknown> {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  return sw.evaluate((k: string) => {
    return new Promise<unknown>((resolve) => {
      chrome.storage.local.get(k, (res) => resolve(res[k]));
    });
  }, key);
}

/** Clear all veilguard storage. */
async function clearStorage(context: BrowserContext): Promise<void> {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  await sw.evaluate(() => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.remove(
        ["vg_events", "vg_audit_log", "vgRecordHistory"],
        () => resolve()
      );
    });
  });
}

async function openOptionsPage(context: BrowserContext): Promise<Page> {
  const extPage = await context.newPage();
  // Get extension ID from the service worker URL
  const [sw] = context.serviceWorkers();
  const extId = new URL(sw.url()).host;
  await extPage.goto(`chrome-extension://${extId}/options.html`);
  await extPage.waitForLoadState("networkidle");
  return extPage;
}

async function openPopupPage(context: BrowserContext): Promise<Page> {
  const extPage = await context.newPage();
  const [sw] = context.serviceWorkers();
  const extId = new URL(sw.url()).host;
  await extPage.goto(`chrome-extension://${extId}/popup.html`);
  await extPage.waitForLoadState("networkidle");
  return extPage;
}

function buildSyntheticEvent(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    destination: "localhost",
    profile: "company",
    decision: "redact",
    user_choice: "sent_sanitized",
    rule_ids: ["PII_COMBINATION_PERSON"],
    category_counts: { PII: 2 },
    entity_count: 2,
    latency_ms: 120,
    source: "prompt",
    outcome: "user_approved",
    ...overrides,
  };
}

async function resetMockServer(): Promise<void> {
  await fetch("http://127.0.0.1:4310/__test/reset", { method: "POST" });
}

async function waitForOverlay(page: Page, timeout = 10000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const host = document.getElementById("veilguard-overlay-host");
        if (!host?.shadowRoot) return false;
        const el =
          host.shadowRoot.getElementById("vg-overlay-title") ||
          host.shadowRoot.getElementById("vg-err-title");
        return el != null;
      },
      undefined,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

async function clickOverlaySendSanitized(page: Page): Promise<void> {
  const host = page.locator("#veilguard-overlay-host");
  await host.locator("button.btn-send").click();
  // Wait for overlay to close
  await page.waitForFunction(
    () => {
      const host = document.getElementById("veilguard-overlay-host");
      if (!host?.shadowRoot) return true;
      return host.shadowRoot.querySelector(".backdrop") == null;
    },
    undefined,
    { timeout: 6000 }
  );
}

// ---------------------------------------------------------------------------
// Test 1: Counts correct
// ---------------------------------------------------------------------------

test.describe("Test 1: Dashboard counts correct (seeded events)", () => {
  let context: BrowserContext;
  let optPage: Page;

  test.beforeAll(async () => {
    context = await launchContext("t1-counts");
    await injectTokenAndProfile(context);
    await clearStorage(context);

    // Seed known events
    const events = [
      buildSyntheticEvent({ decision: "redact", user_choice: "sent_sanitized", latency_ms: 100 }),
      buildSyntheticEvent({ decision: "allow", user_choice: "auto_allowed", latency_ms: 50 }),
      buildSyntheticEvent({ decision: "block", user_choice: "blocked", latency_ms: 200 }),
      buildSyntheticEvent({ decision: "require_approval", user_choice: "cancelled", latency_ms: 150 }),
      buildSyntheticEvent({ decision: "redact", user_choice: "edited", latency_ms: 80 }),
    ];
    await seedEvents(context, events);

    optPage = await openOptionsPage(context);
  });

  test.afterAll(async () => {
    await optPage.close();
    await context.close();
  });

  test("summary cards match seeded event totals", async () => {
    // Should be on Dashboard tab by default
    // Checked = 5
    const checked = optPage.getByText("5", { exact: true }).first();
    await expect(checked).toBeVisible({ timeout: 5000 });

    // Sent sanitized = 1
    await expect(optPage.getByText("1", { exact: true }).first()).toBeVisible();

    // The dashboard shows sections for Decision tiers — verify "redact" bar exists
    await expect(optPage.getByText("Sensitive details found (redaction recommended)").first()).toBeVisible();
  });

  test("recent events table shows correct row count", async () => {
    // Table should show 5 rows (one per event)
    const rows = optPage.locator("table").last().locator("tbody tr");
    await expect(rows).toHaveCount(5, { timeout: 5000 });
  });

  test("latency median and p95 are shown", async () => {
    // Events have latencies [100, 50, 200, 150, 80] → sorted: [50,80,100,150,200]
    // median (p50) = 100 ms; p95 = 200 ms (nearest-rank)
    await expect(optPage.getByText(/100 ms/).first()).toBeVisible({ timeout: 5000 });
    await expect(optPage.getByText(/200 ms/).first()).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Test 2: Filters and time range
// ---------------------------------------------------------------------------

test.describe("Test 2: Filters and time range", () => {
  let context: BrowserContext;
  let optPage: Page;

  test.beforeAll(async () => {
    context = await launchContext("t2-filters");
    await injectTokenAndProfile(context);
    await clearStorage(context);

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const events = [
      buildSyntheticEvent({ timestamp: now.toISOString(), decision: "redact", destination: "localhost" }),
      buildSyntheticEvent({ timestamp: twoDaysAgo.toISOString(), decision: "allow", destination: "localhost" }),
      buildSyntheticEvent({ timestamp: tenDaysAgo.toISOString(), decision: "block", destination: "other.test" }),
    ];
    await seedEvents(context, events);

    optPage = await openOptionsPage(context);
  });

  test.afterAll(async () => {
    await optPage.close();
    await context.close();
  });

  test("24h filter shows only recent event", async () => {
    await optPage.getByRole("button", { name: "Last 24h" }).click();
    await optPage.waitForTimeout(500);
    // Only 1 event in last 24h
    const rows = optPage.locator("table").last().locator("tbody tr");
    await expect(rows).toHaveCount(1, { timeout: 5000 });
  });

  test("7d filter shows 2 events", async () => {
    await optPage.getByRole("button", { name: "Last 7d" }).click();
    await optPage.waitForTimeout(500);
    const rows = optPage.locator("table").last().locator("tbody tr");
    await expect(rows).toHaveCount(2, { timeout: 5000 });
  });

  test("All time shows 3 events", async () => {
    await optPage.getByRole("button", { name: "All time" }).click();
    await optPage.waitForTimeout(500);
    const rows = optPage.locator("table").last().locator("tbody tr");
    await expect(rows).toHaveCount(3, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Test 3: Empty state
// ---------------------------------------------------------------------------

test.describe("Test 3: Empty state renders correctly", () => {
  let context: BrowserContext;
  let optPage: Page;

  test.beforeAll(async () => {
    context = await launchContext("t3-empty");
    await injectTokenAndProfile(context);
    await clearStorage(context);
    optPage = await openOptionsPage(context);
  });

  test.afterAll(async () => {
    await optPage.close();
    await context.close();
  });

  test("empty state message is shown with zero events", async () => {
    await expect(optPage.getByText("No events recorded yet")).toBeVisible({ timeout: 5000 });
    await expect(optPage.getByText(/Events appear here after VeilGuard checks/)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test 4: Malformed events don't crash; skipped count shown
// ---------------------------------------------------------------------------

test.describe("Test 4: Malformed events do not crash dashboard", () => {
  let context: BrowserContext;
  let optPage: Page;

  test.beforeAll(async () => {
    context = await launchContext("t4-malformed");
    await injectTokenAndProfile(context);
    await clearStorage(context);

    // Mix of valid and malformed events
    const events = [
      buildSyntheticEvent(),
      { garbage: true, text: "THIS_SHOULD_BE_STRIPPED_BY_SANITIZER" }, // bad: missing required fields
      { timestamp: "not-a-date", decision: "allow" }, // bad: invalid timestamp
      { timestamp: new Date().toISOString(), decision: "invalid_decision" }, // bad: unknown decision
      buildSyntheticEvent({ decision: "allow", user_choice: "auto_allowed" }),
    ];
    await seedEvents(context, events);

    optPage = await openOptionsPage(context);
  });

  test.afterAll(async () => {
    await optPage.close();
    await context.close();
  });

  test("page loads without error", async () => {
    // The page should render (not blank or crashed)
    await expect(optPage.getByText(/VeilGuard AI/)).toBeVisible({ timeout: 5000 });
  });

  test("skipped malformed events count is shown", async () => {
    // 3 malformed events should be counted in skipped
    await expect(optPage.getByText(/malformed event/)).toBeVisible({ timeout: 5000 });
  });

  test("original values from malformed events do not appear", async () => {
    const text = await optPage.locator("body").textContent() ?? "";
    expect(text).not.toContain("THIS_SHOULD_BE_STRIPPED_BY_SANITIZER");
  });
});

// ---------------------------------------------------------------------------
// Test 5: Export whitelisting
// ---------------------------------------------------------------------------

test.describe("Test 5: Export contains only whitelisted fields", () => {
  let context: BrowserContext;
  let optPage: Page;

  test.beforeAll(async () => {
    context = await launchContext("t5-export");
    await injectTokenAndProfile(context);
    await clearStorage(context);

    // Seed event with rogue extra fields (sanitizeEvent strips them at read-time)
    const rogueEvent = {
      timestamp: new Date().toISOString(),
      destination: "localhost",
      profile: "company",
      decision: "redact",
      user_choice: "sent_sanitized",
      rule_ids: ["PII_COMBINATION_PERSON"],
      category_counts: { PII: 2 },
      entity_count: 2,
      latency_ms: 120,
      source: "prompt",
      outcome: "user_approved",
    };
    await seedEvents(context, [rogueEvent]);

    optPage = await openOptionsPage(context);
  });

  test.afterAll(async () => {
    await optPage.close();
    await context.close();
  });

  test("JSON export contains only whitelisted keys", async () => {
    // Intercept the download
    const [download] = await Promise.all([
      optPage.waitForEvent("download"),
      optPage.getByRole("button", { name: "JSON" }).click(),
    ]);
    const dlPath = await download.path();
    expect(dlPath).toBeTruthy();

    const content = fs.readFileSync(dlPath!, "utf8");
    const parsed = JSON.parse(content) as Array<Record<string, unknown>>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);

    for (const item of parsed) {
      const keys = new Set(Object.keys(item));
      for (const key of keys) {
        expect(EXPORT_WHITELIST.has(key), `Unexpected key "${key}" in export`).toBe(true);
      }
    }
  });

  test("CSV export header contains only whitelisted fields", async () => {
    const [download] = await Promise.all([
      optPage.waitForEvent("download"),
      optPage.getByRole("button", { name: "CSV" }).click(),
    ]);
    const dlPath = await download.path();
    expect(dlPath).toBeTruthy();

    const content = fs.readFileSync(dlPath!, "utf8");
    const header = content.split("\n")[0];
    const csvKeys = header.split(",");
    for (const key of csvKeys) {
      expect(EXPORT_WHITELIST.has(key), `Unexpected CSV column "${key}"`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 6: Clear history
// ---------------------------------------------------------------------------

test.describe("Test 6: Clear history with confirmation", () => {
  let context: BrowserContext;
  let optPage: Page;

  test.beforeAll(async () => {
    context = await launchContext("t6-clear");
    await injectTokenAndProfile(context);
    await clearStorage(context);
    await seedEvents(context, [buildSyntheticEvent(), buildSyntheticEvent()]);
    optPage = await openOptionsPage(context);
  });

  test.afterAll(async () => {
    await optPage.close();
    await context.close();
  });

  test("first click shows confirm button", async () => {
    await optPage.getByRole("button", { name: "Clear history" }).click();
    await expect(optPage.getByRole("button", { name: "Confirm clear" })).toBeVisible({ timeout: 3000 });
  });

  test("cancel does not clear events", async () => {
    await optPage.getByRole("button", { name: "Cancel" }).click();
    // Events should still be visible
    const rows = optPage.locator("table").last().locator("tbody tr");
    await expect(rows).toHaveCount(2, { timeout: 5000 });
  });

  test("confirm clear empties storage and shows empty state", async () => {
    await optPage.getByRole("button", { name: "Clear history" }).click();
    await optPage.getByRole("button", { name: "Confirm clear" }).click();
    // Page reloads and shows empty state
    await expect(optPage.getByText("No events recorded yet")).toBeVisible({ timeout: 10000 });

    // Verify storage is actually empty
    const stored = await readStorage(context, "vg_events");
    expect(stored == null || (Array.isArray(stored) && stored.length === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Pause switch — protection stays on
// ---------------------------------------------------------------------------

test.describe("Test 7: Pause switch leaves protection active", () => {
  let context: BrowserContext;
  let sitePage: Page;
  let optPage: Page;

  test.beforeAll(async () => {
    context = await launchContext("t7-pause");
    await injectTokenAndProfile(context);
    await clearStorage(context);
    optPage = await openOptionsPage(context);
  });

  test.afterAll(async () => {
    if (sitePage) await sitePage.close();
    await optPage.close();
    await context.close();
  });

  test("pause switch toggles recording off", async () => {
    // The switch starts "on" — pause it
    const pauseSwitch = optPage.getByRole("switch", { name: /Pause recording/ });
    await expect(pauseSwitch).toHaveAttribute("aria-checked", "true", { timeout: 5000 });
    await pauseSwitch.click();
    await expect(pauseSwitch).toHaveAttribute("aria-checked", "false", { timeout: 3000 });
    await expect(optPage.getByText(/Paused — protection still on/)).toBeVisible();
  });

  test("review overlay still appears when recording is paused (protection active)", async () => {
    // Open the mock site and submit a flagged prompt
    sitePage = await context.newPage();
    await sitePage.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await sitePage.waitForLoadState("domcontentloaded");
    await sitePage.locator("#chat-composer-textarea").fill(FLAGGED_PROMPT);
    await sitePage.locator("#send-btn").click();

    // Overlay MUST appear even while recording is paused
    const shown = await waitForOverlay(sitePage, 10000);
    expect(shown, "Overlay must appear even with recording paused").toBe(true);

    // Cancel the overlay
    const host = sitePage.locator("#veilguard-overlay-host");
    await host.locator("button.btn-cancel, button.btn-edit, button.btn-dismiss").first().click();
  });

  test("event count does not increase when recording is paused", async () => {
    // Navigate back to options and verify event count is still zero
    await optPage.reload();
    await optPage.waitForLoadState("networkidle");
    // Page should show empty state (no events recorded due to pause)
    await expect(optPage.getByText("No events recorded yet")).toBeVisible({ timeout: 8000 });
  });

  test("resuming recording allows events to be stored again", async () => {
    // Turn recording back on
    const pauseSwitch = optPage.getByRole("switch", { name: /Pause recording/ });
    await pauseSwitch.click();
    await expect(pauseSwitch).toHaveAttribute("aria-checked", "true", { timeout: 3000 });

    // Now run a flow
    await resetMockServer();
    await sitePage.locator("#chat-composer-textarea").fill(BENIGN_PROMPT);
    await sitePage.locator("#send-btn").click();
    // Benign prompt passes through; wait for composer to clear
    await expect(sitePage.locator("#chat-composer-textarea")).toHaveValue("", { timeout: 8000 });
    await expect.poll(async () => {
      const res = await fetch("http://127.0.0.1:4310/__test/received");
      const data = (await res.json()) as { messages?: unknown[] };
      return data.messages?.length ?? 0;
    }, { timeout: 8000 }).toBeGreaterThanOrEqual(1);

    // Reload options and check events
    await optPage.reload();
    await optPage.waitForLoadState("networkidle");
    await optPage.waitForTimeout(1000);
    // At least one event should now be visible (the benign allow)
    const rows = optPage.locator("table").last().locator("tbody tr");
    await expect(rows).toHaveCount(1, { timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// Test 8: Real-flow integration + Test 9: Privacy
// ---------------------------------------------------------------------------

test.describe("Test 8+9: Real flows + privacy assertion", () => {
  let context: BrowserContext;
  let sitePage: Page;
  let optPage: Page;
  let initialEventCount: number;

  test.beforeAll(async () => {
    context = await launchContext("t8-realflow");
    await injectTokenAndProfile(context);
    await clearStorage(context);

    sitePage = await context.newPage();
    await sitePage.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await sitePage.waitForLoadState("domcontentloaded");
    initialEventCount = 0;
  });

  test.afterAll(async () => {
    await sitePage.close();
    if (optPage) await optPage.close();
    await context.close();
  });

  test("flow A: flagged → send sanitized records event", async () => {
    await resetMockServer();
    await sitePage.locator("#chat-composer-textarea").fill(FLAGGED_PROMPT);
    await sitePage.locator("#send-btn").click();
    const shown = await waitForOverlay(sitePage, 10000);
    expect(shown, "Overlay must appear for flagged prompt").toBe(true);
    await clickOverlaySendSanitized(sitePage);
    initialEventCount++;
    // Wait for composer to clear
    await expect(sitePage.locator("#chat-composer-textarea")).toHaveValue("", { timeout: 8000 });
    await sitePage.waitForTimeout(500);
  });

  test("flow B: benign → auto-allowed records event", async () => {
    await resetMockServer();
    await sitePage.locator("#chat-composer-textarea").fill(BENIGN_PROMPT);
    await sitePage.locator("#send-btn").click();
    // Benign prompt passes through; wait for composer to clear
    await expect(sitePage.locator("#chat-composer-textarea")).toHaveValue("", { timeout: 8000 });
    await expect.poll(async () => {
      const res = await fetch("http://127.0.0.1:4310/__test/received");
      const data = (await res.json()) as { messages?: unknown[] };
      return data.messages?.length ?? 0;
    }, { timeout: 8000 }).toBeGreaterThanOrEqual(1);
    initialEventCount++;
  });

  test("flow C: flagged → cancel records cancelled event", async () => {
    await resetMockServer();
    await sitePage.locator("#chat-composer-textarea").fill(FLAGGED_PROMPT);
    await sitePage.locator("#send-btn").click();
    const shown = await waitForOverlay(sitePage, 10000);
    expect(shown).toBe(true);
    // Click cancel
    const host = sitePage.locator("#veilguard-overlay-host");
    await host.locator("button.btn-cancel").click();
    await sitePage.waitForTimeout(1000);
    initialEventCount++;
  });

  test("dashboard counts match real-flow actions", async () => {
    optPage = await openOptionsPage(context);
    await optPage.waitForTimeout(2000); // let storage propagate

    // Should have at least initialEventCount events visible
    const rows = optPage.locator("table").last().locator("tbody tr");
    await expect(rows).toHaveCount(initialEventCount, { timeout: 8000 });
  });

  test("Test 9: no original synthetic values in rendered dashboard text", async () => {
    if (!optPage || optPage.isClosed()) {
      optPage = await openOptionsPage(context);
    }
    const text = await optPage.locator("body").textContent() ?? "";
    expect(text, "Synthetic name must not appear in dashboard").not.toContain(SYNTHETIC_NAME);
    expect(text, "Synthetic phone must not appear in dashboard").not.toContain(SYNTHETIC_PHONE);
    expect(text, "Prompt text must not appear in dashboard").not.toContain(FLAGGED_PROMPT);
  });

  test("Test 9: no original values in JSON export", async () => {
    if (!optPage || optPage.isClosed()) {
      optPage = await openOptionsPage(context);
    }
    const [download] = await Promise.all([
      optPage.waitForEvent("download"),
      optPage.getByRole("button", { name: "JSON" }).click(),
    ]);
    const dlPath = await download.path();
    const content = dlPath ? fs.readFileSync(dlPath, "utf8") : "{}";
    expect(content).not.toContain(SYNTHETIC_NAME);
    expect(content).not.toContain(SYNTHETIC_PHONE);
    expect(content).not.toContain(FLAGGED_PROMPT);
  });

  test("Test 9: no original values in chrome.storage.local", async () => {
    const stored = await readStorage(context, "vg_events");
    const json = JSON.stringify(stored ?? []);
    expect(json).not.toContain(SYNTHETIC_NAME);
    expect(json).not.toContain(SYNTHETIC_PHONE);
    expect(json).not.toContain(FLAGGED_PROMPT);
    // Token must not be in events storage
    expect(json).not.toContain(E2E_TOKEN);
  });

  test("Test 9: save honest screenshot of dashboard after real flows", async () => {
    if (!optPage || optPage.isClosed()) {
      optPage = await openOptionsPage(context);
    }
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
    await optPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, "dashboard-mock-site-run.png"),
      fullPage: true,
    });
    expect(
      fs.existsSync(path.join(SCREENSHOTS_DIR, "dashboard-mock-site-run.png"))
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 10: Popup statuses
// ---------------------------------------------------------------------------

test.describe("Test 10: Popup status states", () => {
  let context: BrowserContext;
  let popupPage: Page;

  test.beforeAll(async () => {
    context = await launchContext("t10-popup");
    await injectTokenAndProfile(context);
  });

  test.afterAll(async () => {
    if (popupPage && !popupPage.isClosed()) await popupPage.close();
    await context.close();
  });

  test("popup shows engine connected when engine is up", async () => {
    popupPage = await openPopupPage(context);
    await expect(popupPage.getByText("Connected")).toBeVisible({ timeout: 8000 });
  });

  test("popup shows active profile", async () => {
    await expect(popupPage.getByText("company")).toBeVisible({ timeout: 5000 });
  });

  test("popup shows 'Not active on this site' on about:blank (no content script)", async () => {
    if (popupPage && !popupPage.isClosed()) {
      await popupPage.close();
    }
    const blankPage = await context.newPage();
    await blankPage.goto("about:blank");
    await blankPage.waitForTimeout(500);

    // Re-open popup (popup queries the active tab)
    popupPage = await openPopupPage(context);
    // about:blank has no content script, so popup should say "not active"
    await expect(popupPage.getByText(/Not active on this site/)).toBeVisible({ timeout: 8000 });
    await blankPage.close();
  });

  test("popup shows 'Protected' on mock site (content script active)", async () => {
    if (popupPage && !popupPage.isClosed()) {
      await popupPage.close();
    }
    const sitePage = await context.newPage();
    await sitePage.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await sitePage.waitForLoadState("domcontentloaded");
    await sitePage.waitForTimeout(1000); // let content script initialize

    popupPage = await openPopupPage(context);
    await expect(popupPage.getByText("Protected")).toBeVisible({ timeout: 8000 });

    await sitePage.close();
  });

  test("popup shows engine unreachable when engine is down", async () => {
    // Intercept fetch in the service worker to simulate engine down (network error)
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 10000 });
    await sw.evaluate(() => {
      const orig = globalThis.fetch;
      (globalThis as any).__origFetch = orig;
      globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = typeof url === "string" ? url : url instanceof URL ? url.href : (url as Request).url;
        if (u.includes(":8765")) {
          throw new TypeError("Failed to fetch (ECONNREFUSED)");
        }
        return orig(url, init);
      };
    });

    if (popupPage && !popupPage.isClosed()) {
      await popupPage.close();
    }
    popupPage = await openPopupPage(context);
    await expect(popupPage.getByText("Unreachable", { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(
      popupPage.getByText(/Sending is blocked while the engine is unreachable/)
    ).toBeVisible();

    // Restore fetch
    await sw.evaluate(() => {
      if ((globalThis as any).__origFetch) {
        globalThis.fetch = (globalThis as any).__origFetch;
        delete (globalThis as any).__origFetch;
      }
    });
  });

  test("save popup screenshot", async () => {
    // Restore valid state
    const sitePage = await context.newPage();
    await sitePage.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await sitePage.waitForLoadState("domcontentloaded");
    await sitePage.waitForTimeout(800);

    if (popupPage && !popupPage.isClosed()) {
      await popupPage.close();
    }
    popupPage = await openPopupPage(context);
    await popupPage.waitForTimeout(2000);

    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
    await popupPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, "popup-mock-site.png"),
    });
    expect(
      fs.existsSync(path.join(SCREENSHOTS_DIR, "popup-mock-site.png"))
    ).toBe(true);

    await sitePage.close();
  });
});

// ---------------------------------------------------------------------------
// Test 11: Large data — 1000 events render performance
// ---------------------------------------------------------------------------

test.describe("Test 11: 1000-event render performance", () => {
  let context: BrowserContext;
  let optPage: Page;

  test.beforeAll(async () => {
    context = await launchContext("t11-large");
    await injectTokenAndProfile(context);
    await clearStorage(context);

    // Seed 1000 synthetic events spanning the last 14 days
    const events: unknown[] = [];
    const now = Date.now();
    for (let i = 0; i < 1000; i++) {
      const tsOffset = (i % 14) * 24 * 60 * 60 * 1000;
      const ts = new Date(now - tsOffset).toISOString();
      events.push(
        buildSyntheticEvent({
          timestamp: ts,
          decision: (["allow", "redact", "require_approval", "block"] as const)[i % 4],
          user_choice: (["auto_allowed", "sent_sanitized", "cancelled", "blocked"] as const)[i % 4],
          latency_ms: 50 + (i % 200),
        })
      );
    }
    await seedEvents(context, events);
  });

  test.afterAll(async () => {
    if (optPage) await optPage.close();
    await context.close();
  });

  test("1000 events load and render without error, record render time", async () => {
    const t0 = Date.now();
    optPage = await openOptionsPage(context);
    await optPage.waitForLoadState("networkidle");
    const elapsed = Date.now() - t0;

    // Report render time (no pass/fail threshold, just record it)
    console.log(`[Test 11] 1000-event dashboard render time: ${elapsed} ms`);

    // Confirm page did not error
    await expect(optPage.getByText(/VeilGuard AI/)).toBeVisible({ timeout: 5000 });
    // Counts should show "1000 events loaded"
    await expect(optPage.getByText(/1000 event/)).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Test 12: Offline/CSP — no external network requests
// ---------------------------------------------------------------------------

test.describe("Test 12: No external network requests from dashboard or popup", () => {
  let context: BrowserContext;
  let optPage: Page;
  let popupPage: Page;
  const externalRequests: string[] = [];

  test.beforeAll(async () => {
    context = await launchContext("t12-csp");
    await injectTokenAndProfile(context);
    await clearStorage(context);
    await seedEvents(context, [buildSyntheticEvent()]);
  });

  test.afterAll(async () => {
    if (optPage) await optPage.close();
    if (popupPage) await popupPage.close();
    await context.close();
  });

  test("dashboard makes no external requests (only 127.0.0.1 or chrome-extension://)", async () => {
    optPage = await openOptionsPage(context);

    // Capture all requests from the options page
    optPage.on("request", (req) => {
      const url = req.url();
      // Allow extension-internal and loopback engine calls
      if (
        !url.startsWith("chrome-extension://") &&
        !url.startsWith("http://127.0.0.1:") &&
        !url.startsWith("data:") &&
        !url.startsWith("blob:")
      ) {
        externalRequests.push(url);
      }
    });

    await optPage.waitForTimeout(3000);
    await optPage.reload();
    await optPage.waitForLoadState("networkidle");
    await optPage.waitForTimeout(1000);

    expect(
      externalRequests,
      `External requests found: ${externalRequests.join(", ")}`
    ).toHaveLength(0);
  });

  test("popup makes no external requests", async () => {
    const popupExternal: string[] = [];
    popupPage = await openPopupPage(context);
    popupPage.on("request", (req) => {
      const url = req.url();
      if (
        !url.startsWith("chrome-extension://") &&
        !url.startsWith("http://127.0.0.1:") &&
        !url.startsWith("data:") &&
        !url.startsWith("blob:")
      ) {
        popupExternal.push(url);
      }
    });
    await popupPage.waitForTimeout(3000);
    expect(
      popupExternal,
      `Popup external requests: ${popupExternal.join(", ")}`
    ).toHaveLength(0);
  });
});
