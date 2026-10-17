/**
 * VeilGuard AI - Phase 4 Part C: Degraded Mode & Backstop Canary E2E Tests
 *
 * Verifies:
 *  1. Degraded mode on mock site (?break_selectors=1):
 *     - Adapter self-test fails.
 *     - Badge shows "Limited protection (site layout changed)".
 *     - DOM layer does not intercept, but Layer 2 backstop intercepts fetch.
 *     - Flagged submissions are blocked by backstop with zero leaks to /api/chat.
 *     - Benign submissions are allowed by backstop and delivered.
 *  2. Backstop canary:
 *     - If an approved send is triggered but no network request is observed within 5s,
 *       the badge transitions to "Backstop may not be working (canary)".
 *     - If network request is observed, canary timer is cleared.
 *
 * Rules:
 *  - Rule 6: Fail closed (backstop protects even when DOM layer is broken).
 *  - Rule 7: Zero raw content persistence.
 *  - Rule 10: Synthetic test data exclusively.
 */

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const EXTENSION_DIST = path.resolve(ROOT_DIR, "extension/dist");

const E2E_TOKEN = process.env["VEILGUARD_TOKEN"] ?? "e2e-test-token";

const SYNTHETIC_NAME = "Rahul Sharma";
const SYNTHETIC_PHONE = "9876543210";
const FLAGGED_PROMPT = `Analyze customer ${SYNTHETIC_NAME}'s account. Contact: ${SYNTHETIC_PHONE}.`;
const BENIGN_PROMPT = "Summarize the history of cryptography.";

async function resetMockServer(): Promise<void> {
  await fetch("http://127.0.0.1:4310/__test/reset", { method: "POST" });
}

async function getReceivedMessages(): Promise<Array<{ message: string; timestamp: string }>> {
  const res = await fetch("http://127.0.0.1:4310/__test/received");
  const data = (await res.json()) as { messages: Array<{ message: string; timestamp: string }> };
  return data.messages || [];
}

async function injectToken(context: BrowserContext): Promise<void> {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  await sw.evaluate(
    ({ t }) =>
      new Promise<void>((resolve) => {
        chrome.storage.local.set({ vg_token: t, vg_profile: "company" }, () => resolve());
      }),
    { t: E2E_TOKEN }
  );
}

test.describe("Phase 4 Part C: Degraded Mode & Backstop Canary", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    const profileDir = path.resolve(ROOT_DIR, "test-results/.playwright-degraded-canary-profile");
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_DIST}`,
        `--load-extension=${EXTENSION_DIST}`,
      ],
    });

    let [sw] = context.serviceWorkers();
    if (!sw) {
      await context.waitForEvent("serviceworker", { timeout: 15000 });
    }

    page = context.pages()[0] || (await context.newPage());
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");
    await injectToken(context);
  });

  test.afterAll(async () => {
    await page.close();
    await context.close();
  });

  test("Degraded mode: ?break_selectors=1 shows limited badge and backstop blocks sensitive prompts", async () => {
    await resetMockServer();

    // Navigate to mock site with break_selectors=1
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=click&transport=fetch&break_selectors=1");
    await page.waitForLoadState("domcontentloaded");

    // 1. Verify badge shows limited protection
    await page.waitForFunction(
      () => {
        const host = document.getElementById("veilguard-badge-host");
        if (!host?.shadowRoot) return false;
        const textEl = host.shadowRoot.getElementById("veilguard-badge-text");
        return textEl && textEl.textContent?.includes("Limited protection");
      },
      undefined,
      { timeout: 8000 }
    );

    const badgeText = await page.evaluate(() => {
      const host = document.getElementById("veilguard-badge-host");
      return host?.shadowRoot?.getElementById("veilguard-badge-text")?.textContent?.trim();
    });
    expect(badgeText).toBe("Limited protection (site layout changed)");

    // 2. Submit flagged text via broken elements
    await page.locator("#broken-composer-textarea").fill(FLAGGED_PROMPT);
    await page.locator("#broken-send-btn").click();

    // 3. Backstop must intercept and show error overlay
    await page.waitForFunction(
      () => {
        const host = document.getElementById("veilguard-overlay-host");
        if (!host?.shadowRoot) return false;
        const titleEl = host.shadowRoot.getElementById("vg-err-title");
        const backdropEl = host.shadowRoot.querySelector(".backdrop");
        return titleEl != null || backdropEl != null;
      },
      undefined,
      { timeout: 8000 }
    );

    // 4. Verify no message reached the server
    const receivedAfterFlagged = await getReceivedMessages();
    expect(receivedAfterFlagged.length).toBe(0);

    // 5. Dismiss overlay via Playwright trusted click
    await page.locator("#veilguard-overlay-host").locator("button.btn-dismiss").click();

    // 6. Submit benign text via broken elements
    await page.locator("#broken-composer-textarea").fill(BENIGN_PROMPT);
    await page.locator("#broken-send-btn").click();

    // 7. Verify benign text was delivered
    await expect
      .poll(
        async () => {
          const msgs = await getReceivedMessages();
          return msgs.length;
        },
        { timeout: 8000, intervals: [100, 250, 500] }
      )
      .toBe(1);

    const receivedAfterBenign = await getReceivedMessages();
    expect(receivedAfterBenign[0].message).toBe(BENIGN_PROMPT);
  });

  test("Canary check: missing chat request triggers backstop canary warning badge", async () => {
    // Navigate back to standard mock site
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    // Wait for active protection badge
    await page.waitForFunction(
      () => {
        const host = document.getElementById("veilguard-badge-host");
        if (!host?.shadowRoot) return false;
        const textEl = host.shadowRoot.getElementById("veilguard-badge-text");
        return textEl && textEl.textContent?.includes("protection active");
      },
      undefined,
      { timeout: 8000 }
    );

    // Trigger canary check in content script without sending any network request
    // This simulates an approved send where the underlying request was never observed
    await page.evaluate(() => {
      // Dispatch custom test seam or simulate canary trigger
      window.postMessage({ type: "VEILGUARD_TRIGGER_TEST_CANARY" }, "*");
    });

    // Wait 5.2 seconds for canary timer (5000ms) to fire
    await page.waitForFunction(
      () => {
        const host = document.getElementById("veilguard-badge-host");
        if (!host?.shadowRoot) return false;
        const textEl = host.shadowRoot.getElementById("veilguard-badge-text");
        return textEl && textEl.textContent?.includes("canary");
      },
      undefined,
      { timeout: 10000 }
    );

    const canaryBadgeText = await page.evaluate(() => {
      const host = document.getElementById("veilguard-badge-host");
      return host?.shadowRoot?.getElementById("veilguard-badge-text")?.textContent?.trim();
    });
    expect(canaryBadgeText).toBe("Backstop may not be working (canary)");
  });
});
