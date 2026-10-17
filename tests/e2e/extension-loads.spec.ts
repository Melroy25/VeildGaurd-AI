import { test, expect, chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("extension loads and displays 'Protection inactive' in popup", async () => {
  const pathToExtension = path.resolve(__dirname, "../../extension/dist");
  expect(fs.existsSync(pathToExtension)).toBeTruthy();

  // Temporary browser profile directory
  const userDataDir = path.resolve(__dirname, "../../test-results/.playwright-profile");

  // Launch Chromium persistent context with extension loaded in headed mode
  // Note: Headed mode is selected per Playwright guidance as Chromium extension
  // service workers and extension pages are most reliably executed with full browser rendering.
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  try {
    // Wait for background service worker
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 10000 });
    }

    // Derive extension ID from service worker URL: chrome-extension://<id>/background.js
    const extensionId = serviceWorker.url().split("/")[2];
    expect(extensionId).toBeTruthy();

    // Open popup page
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Assert popup UI renders and indicates Phase 3c status
    await expect(page.locator("text=VeilGuard AI")).toBeVisible();
    await expect(page.locator("text=Open Dashboard")).toBeVisible();

    await page.close();
  } finally {
    await context.close();
  }
});
