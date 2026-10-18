/**
 * VeilGuard AI - PDF Scanner & True Redaction E2E Test
 *
 * Verifies:
 *  1. Options page "Document Scanner" tab navigation.
 *  2. In-memory scanning via POST /pdf/scan without raw text leakage.
 *  3. Findings summary cards and entity table rendering.
 *  4. True redaction & automatic download of sanitized PDF.
 *  5. Audit log event recording with source="document".
 *
 * Rule 10: All test data is strictly synthetic.
 * Rule 7: Zero raw content persistence.
 */

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const EXTENSION_DIST = path.resolve(ROOT_DIR, "extension/dist");
const TEST_DIR = path.resolve(ROOT_DIR, "test-results");

const E2E_TOKEN = process.env["VEILGUARD_TOKEN"] ?? "e2e-test-token";

test.describe("PDF Scanner & True Redaction E2E", () => {
  let context: BrowserContext;
  let page: Page;
  let testPdfPath: string;

  test.beforeAll(async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    testPdfPath = path.join(TEST_DIR, "synthetic-invoice.pdf");

    const pyScript = `import fitz; doc = fitz.open(); p = doc.new_page(); p.insert_text((72, 72), 'Confidential Invoice: Client Rahul Sharma'); p.insert_text((72, 96), 'Emergency Contact: 9876543210'); p.insert_text((72, 120), 'AWS Access Key: AKIAIOSFODNN7EXAMPLE'); doc.save(r'${testPdfPath.replace(/\\/g, "/")}'); doc.close()`;
    execSync(`.venv\\Scripts\\python -c "${pyScript}"`, {
      cwd: ROOT_DIR,
    });

    const profileDir = path.resolve(ROOT_DIR, "test-results/.playwright-pdf-scanner");
    context = await chromium.launchPersistentContext(profileDir, {
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
    if (fs.existsSync(testPdfPath)) {
      try {
        fs.unlinkSync(testPdfPath);
      } catch {
        // ignore
      }
    }
  });

  test("scans PDF in-memory, displays entity coordinates/placeholders, and redacts document", async () => {
    let [sw] = context.serviceWorkers();
    if (!sw) {
      sw = await context.waitForEvent("serviceworker", { timeout: 10000 });
    }
    const extId = new URL(sw.url()).host;

    // 1. Open Options page
    await page.goto(`chrome-extension://${extId}/options.html`);
    await page.waitForSelector("#root");

    // 2. Click Document Scanner tab
    await page.locator("#tab-pdf").click();
    await page.waitForSelector("#pdf-scanner-tab");

    // 3. Upload synthetic PDF
    await page.locator("#pdf-file-picker").setInputFiles(testPdfPath);
    const selectedName = await page.locator("#pdf-selected-name").textContent();
    expect(selectedName).toContain("synthetic-invoice.pdf");

    // 4. Click Scan Document
    await page.locator("#pdf-scan-button").click();
    await page.waitForSelector("#pdf-results-card", { timeout: 15000 });

    // Assert summary
    const pagesText = await page.locator("#pdf-summary-pages").textContent();
    expect(pagesText).toBe("1");

    const findingsText = await page.locator("#pdf-summary-findings").textContent();
    const count = parseInt(findingsText || "0", 10);
    expect(count).toBeGreaterThanOrEqual(2);

    // Assert findings table has placeholders and NO raw sensitive values
    const tableText = await page.locator("#pdf-findings-table-body").innerText();
    expect(tableText).toContain("[PHONE_1]");
    expect(tableText).toContain("[CRITICAL_SECRET]");
    // Rule 7 invariant: zero raw text rendered in UI
    expect(tableText).not.toContain("Rahul Sharma");
    expect(tableText).not.toContain("9876543210");
    expect(tableText).not.toContain("AKIAIOSFODNN7EXAMPLE");

    // 5. Click Redact & Download
    const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
    await page.locator("#pdf-redact-button").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("synthetic-invoice-sanitized.pdf");

    // Wait for success notice
    await page.waitForSelector("#pdf-success-banner", { timeout: 10000 });
    const successBanner = await page.locator("#pdf-success-banner").textContent();
    expect(successBanner).toContain("Dual-extractor verified");

    // 6. Switch to Dashboard tab and verify document audit event
    await page.locator('button[role="tab"]:has-text("Dashboard")').click();
    await page.waitForSelector("#summary-cards", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Read stored events from service worker
    const events = await sw.evaluate(() => {
      return new Promise<unknown[]>((resolve) => {
        chrome.storage.local.get("vg_events", (res) => resolve(res["vg_events"] || []));
      });
    });

    const docEvent = (events as Array<{ source?: string }>).find((e) => e.source === "document");
    expect(docEvent).toBeDefined();
    expect(docEvent).toMatchObject({
      destination: "local-pdf",
      source: "document",
      outcome: "user_approved",
    });
  });
});
