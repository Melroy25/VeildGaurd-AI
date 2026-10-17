/**
 * VeilGuard AI - 4-Minute Demo Rehearsal Test & Screenshot Suite
 *
 * Runs an automated rehearsal of the full demonstration script:
 *   Act 1: Initial Mock AI Chat Interface
 *   Act 2: Sensitive Customer Prompt Entered
 *   Act 3: Real-Time Interception & Review Overlay (Findings, Diff, Risk)
 *   Act 4: Sanitized Delivery & Utility Preservation
 *   Act 5: Severe System Secret Block Overlay (Zero Override)
 *   Act 6: Metadata-Only Privacy Dashboard
 *
 * Captures clean, high-resolution screenshots to docs/screenshots/demo-*.png
 * Strictly synthetic data (Rule 10).
 */

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const EXTENSION_DIST = path.resolve(ROOT_DIR, "extension/dist");
const SCREENSHOTS_DIR = path.resolve(ROOT_DIR, "docs/screenshots");

const E2E_TOKEN = process.env["VEILGUARD_TOKEN"] ?? "e2e-test-token";

test.describe("Demo Rehearsal & Live Evidence Suite", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const profileDir = path.resolve(ROOT_DIR, "test-results/.playwright-demo-rehearsal");
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${EXTENSION_DIST}`,
        `--load-extension=${EXTENSION_DIST}`,
      ],
    });

    let [sw] = context.serviceWorkers();
    if (!sw) {
      sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
    }

    await sw.evaluate(
      ({ t, p }) =>
        new Promise<void>((resolve) => {
          chrome.storage.local.set({ vg_token: t, vg_profile: p }, () => resolve());
        }),
      { t: E2E_TOKEN, p: "company" }
    );

    page = context.pages()[0] || (await context.newPage());
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test("runs complete rehearsal and captures high-res demo screenshots", async () => {
    // Reset mock server
    await page.request.post("http://127.0.0.1:4310/__test/reset");

    // Act 1: Initial Mock AI Interface
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForSelector("#chat-composer-textarea");
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "demo-01-mock-site-initial.png"),
      fullPage: false,
    });

    // Act 2: Enter Sensitive Prompt
    const customerPrompt =
      "Analyze customer Rahul Sharma's account. His phone number is 9876543210 and Aadhaar number is 2345 6789 0123. Please check his recent transaction TXN-9012 for billing discrepancies.";
    await page.locator("#chat-composer-textarea").fill(customerPrompt);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "demo-02-prompt-entered.png"),
      fullPage: false,
    });

    // Act 3: Submit & Review Overlay
    await page.locator("#send-btn").click();

    // Wait for Shadow DOM overlay
    await page.waitForFunction(() => {
      const host = document.getElementById("veilguard-overlay-host");
      return (
        host?.shadowRoot?.getElementById("vg-overlay-title") != null ||
        host?.shadowRoot?.getElementById("vg-err-title") != null
      );
    }, undefined, { timeout: 12000 });

    // Assert overlay elements exist
    const overlayTitle = await page.evaluate(() => {
      const host = document.getElementById("veilguard-overlay-host");
      return host?.shadowRoot?.getElementById("vg-overlay-title")?.textContent;
    });
    expect(overlayTitle).toContain("Sensitive Content Detected");

    // Capture overlay screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "demo-03-review-overlay.png"),
      fullPage: false,
    });

    // Act 4: Send Sanitized
    await page.locator("#veilguard-overlay-host").locator("button.btn-send").click();

    // Wait for overlay to dismiss
    await page.waitForFunction(() => {
      const host = document.getElementById("veilguard-overlay-host");
      if (!host?.shadowRoot) return true;
      return host.shadowRoot.querySelector(".backdrop") == null;
    }, undefined, { timeout: 6000 });

    // Wait for chat response stream to render
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "demo-04-sanitized-sent.png"),
      fullPage: false,
    });

    // Assert server received sanitized text, not original
    const serverRes = await page.request.get("http://127.0.0.1:4310/__test/received");
    const data = (await serverRes.json()) as { messages?: Array<{ message: string }> };
    expect(data.messages?.length).toBeGreaterThan(0);
    const sentMsg = data.messages![data.messages!.length - 1].message;
    expect(sentMsg).not.toContain("Rahul Sharma");
    expect(sentMsg).not.toContain("9876543210");
    expect(sentMsg).toContain("[CUSTOMER_1]");

    // Act 5: Critical Secret Triggering Hard Block
    const secretPrompt =
      "Debug database connection: DATABASE_URL=postgres://app_user:s3cr3tP@ssw0rd!@db.internal:5432/prod_db";
    await page.locator("#chat-composer-textarea").fill(secretPrompt);
    await page.locator("#send-btn").click();

    await page.waitForFunction(() => {
      const host = document.getElementById("veilguard-overlay-host");
      const title = host?.shadowRoot?.getElementById("vg-overlay-title");
      return title?.textContent?.includes("Blocked") || false;
    }, undefined, { timeout: 12000 });

    // Assert Send Original button is absent
    const hasSendOriginal = await page.evaluate(() => {
      const host = document.getElementById("veilguard-overlay-host");
      return host?.shadowRoot?.querySelector("button.btn-original") != null;
    });
    expect(hasSendOriginal).toBe(false);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "demo-05-block-overlay.png"),
      fullPage: false,
    });

    // Close block overlay
    await page.locator("#veilguard-overlay-host").locator("button.btn-cancel, button.btn-edit").first().click();

    await page.waitForFunction(() => {
      const host = document.getElementById("veilguard-overlay-host");
      if (!host?.shadowRoot) return true;
      return host.shadowRoot.querySelector(".backdrop") == null;
    }, undefined, { timeout: 4000 });

    // Act 6: Privacy Dashboard
    let [sw] = context.serviceWorkers();
    if (!sw) {
      sw = await context.waitForEvent("serviceworker", { timeout: 10000 });
    }
    const extensionId = new URL(sw.url()).host;
    const dashboardPage = await context.newPage();
    await dashboardPage.goto(`chrome-extension://${extensionId}/options.html`);
    await dashboardPage.waitForSelector("#root");
    await dashboardPage.waitForLoadState("networkidle");
    await dashboardPage.waitForTimeout(1000);

    await dashboardPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, "demo-06-privacy-dashboard.png"),
      fullPage: false,
    });

    await dashboardPage.close();
  });
});
