import { test, expect, chromium, BrowserContext, Page, APIRequestContext } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const EXTENSION_DIST = path.resolve(ROOT_DIR, "extension/dist");
const RESULTS_PATH = path.resolve(ROOT_DIR, "bench/results/enforcement_mock_site.json");

const FLAGGED_PROMPT = "Analyze customer Test Person's account, phone number 9876543210, and transaction history.";
const BENIGN_PROMPT = "Summarize the benefits of unit testing in three bullet points.";
const SENSITIVE_PHONE = "9876543210";

interface ResultCell {
  composer: "textarea" | "contenteditable";
  wiring: "form" | "click";
  path: "click" | "enter" | "submit" | "programmatic_fetch" | "programmatic_xhr";
  transport: "fetch" | "xhr";
  flagged_trials: number;
  flagged_leaked: number;
  benign_trials: number;
  benign_delivered_correctly: number;
}

interface BenchmarkReport {
  timestamp: string;
  playwright_version: string;
  chromium_version: string;
  trials_per_cell: number;
  note: string;
  cells: ResultCell[];
}

// In-memory collector for benchmark output
const benchmarkResults: ResultCell[] = [];

async function resetServer(request: APIRequestContext) {
  const res = await request.post("http://127.0.0.1:4310/__test/reset");
  expect(res.ok()).toBeTruthy();
}

async function getReceivedMessages(request: APIRequestContext): Promise<Array<{ message: string; timestamp: string }>> {
  const res = await request.get("http://127.0.0.1:4310/__test/received");
  const data = await res.json();
  return data.messages || [];
}

async function setComposerText(page: Page, composer: "textarea" | "contenteditable", text: string) {
  if (composer === "textarea") {
    const textarea = page.locator("#chat-composer-textarea");
    await textarea.fill(text);
  } else {
    const editable = page.locator("#chat-composer-editable");
    await editable.click();
    await page.evaluate((val) => {
      const el = document.getElementById("chat-composer-editable");
      if (el) {
        el.innerText = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, text);
  }
}

async function getComposerText(page: Page, composer: "textarea" | "contenteditable"): Promise<string> {
  if (composer === "textarea") {
    return page.locator("#chat-composer-textarea").inputValue();
  } else {
    return page.evaluate(() => {
      const el = document.getElementById("chat-composer-editable");
      return el ? el.innerText : "";
    });
  }
}

async function triggerSubmission(page: Page, pathType: "click" | "enter" | "submit") {
  if (pathType === "click") {
    await page.locator("#send-btn").click();
  } else if (pathType === "enter") {
    // Ensure focus is on the active composer before pressing Enter so that the
    // content script capture-phase listener sees the correct target
    const focused = await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>("#chat-composer-textarea");
      const ce = document.querySelector<HTMLDivElement>("#chat-composer-editable");
      const active = ta || ce;
      if (active) {
        active.focus();
        return true;
      }
      return false;
    });
    if (!focused) throw new Error("No composer found to focus before Enter press");
    await page.keyboard.press("Enter");
  } else if (pathType === "submit") {
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>("#chat-form");
      form?.requestSubmit();
    });
  }
}

test.describe("Phase 1: Enforcement Spike (Part A)", () => {
  let context: BrowserContext;
  let page: Page;

  const N_TRIALS = process.env.VG_TRIALS ? parseInt(process.env.VG_TRIALS, 10) : 20;

  test.beforeAll(async () => {
    const profileDir = path.resolve(ROOT_DIR, "test-results/.playwright-enforcement-profile");
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_DIST}`,
        `--load-extension=${EXTENSION_DIST}`,
      ],
    });

    // Wait for extension background service worker
    let [sw] = context.serviceWorkers();
    if (!sw) {
      await context.waitForEvent("serviceworker", { timeout: 10000 });
    }

    page = await context.newPage();
  });

  test.afterAll(async () => {
    // Write results JSON
    const report: BenchmarkReport = {
      timestamp: new Date().toISOString(),
      playwright_version: "1.50.1",
      chromium_version: context.browser()?.version() || "unknown",
      trials_per_cell: N_TRIALS,
      note: "These measurements apply strictly to the deterministic mock AI chat site and do not represent pass rates on any production third-party AI website.",
      cells: benchmarkResults,
    };

    const dir = path.dirname(RESULTS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(report, null, 2), "utf-8");

    await page.close();
    await context.close();
  });

  test("Badge check: shows protection active on mock site", async () => {
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form");
    const badge = page.locator("#veilguard-badge");
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#veilguard-badge-text")).toHaveText("VeilGuard: protection active");
  });

  test("Console privacy check: flagged prompt attempts never log phone number to console", async () => {
    const consoleLogs: string[] = [];
    page.on("console", (msg) => consoleLogs.push(msg.text()));

    await resetServer(page.request);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=click");
    await setComposerText(page, "textarea", FLAGGED_PROMPT);
    await page.locator("#send-btn").click();

    await expect(page.locator("#veilguard-title")).toBeVisible();

    // Verify invariant: sensitive phone number never appeared in console logs
    for (const log of consoleLogs) {
      expect(log).not.toContain(SENSITIVE_PHONE);
    }
  });

  test("Enter key edge cases: Shift+Enter inserts newline and IME composition is not blocked", async () => {
    await resetServer(page.request);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form");

    // 1. Shift+Enter
    const textarea = page.locator("#chat-composer-textarea");
    await textarea.click();
    await textarea.fill("First line");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Second line");

    const receivedAfterShift = await getReceivedMessages(page.request);
    expect(receivedAfterShift.length).toBe(0);

    // 2. Synthetic IME composition keydown
    await page.evaluate(() => {
      const textareaEl = document.querySelector("#chat-composer-textarea");
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 229,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });
      textareaEl?.dispatchEvent(event);
    });

    // Verify nothing sent and overlay did not appear
    const overlay = page.locator("#veilguard-title");
    await expect(overlay).not.toBeVisible();
    const receivedAfterIME = await getReceivedMessages(page.request);
    expect(receivedAfterIME.length).toBe(0);
  });

  // Matrix: composer (textarea, contenteditable) x wiring (form, click)
  const configurations: Array<{
    composer: "textarea" | "contenteditable";
    wiring: "form" | "click";
    paths: Array<"click" | "enter" | "submit">;
  }> = [
    { composer: "textarea", wiring: "form", paths: ["click", "enter", "submit"] },
    { composer: "textarea", wiring: "click", paths: ["click", "enter"] },
    { composer: "contenteditable", wiring: "form", paths: ["click", "enter", "submit"] },
    { composer: "contenteditable", wiring: "click", paths: ["click", "enter"] },
  ];

  for (const config of configurations) {
    for (const pathType of config.paths) {
      test(`Enforcement: composer=${config.composer} wiring=${config.wiring} path=${pathType} [N=${N_TRIALS}]`, async () => {
        let flaggedLeaked = 0;
        let benignDelivered = 0;

        await page.goto(
          `http://127.0.0.1:4310/?composer=${config.composer}&wiring=${config.wiring}&transport=fetch`
        );
        await expect(page.locator("#veilguard-badge")).toBeVisible({ timeout: 5000 });

        // Run N trials for flagged prompt
        for (let i = 0; i < N_TRIALS; i++) {
          await resetServer(page.request);
          await setComposerText(page, config.composer, FLAGGED_PROMPT);

          await triggerSubmission(page, pathType);

          // 1. Overlay must appear
          const overlayTitle = page.locator("#veilguard-title");
          await expect(overlayTitle).toBeVisible();

          // 2. Composer text must remain unchanged
          const remainingText = await getComposerText(page, config.composer);
          expect(remainingText).toContain(SENSITIVE_PHONE);

          // 3. Server MUST have received 0 messages
          const received = await getReceivedMessages(page.request);
          if (received.length > 0) {
            flaggedLeaked++;
          }

          // Dismiss overlay for next iteration
          const dismissBtn = page.locator("#veilguard-dismiss-btn");
          await dismissBtn.click();
          await expect(overlayTitle).not.toBeVisible();
        }

        // Reload for the benign control phase: ensures app.js state is clean
        // after N dismiss cycles (no stale event listeners or focus state)
        await page.goto(
          `http://127.0.0.1:4310/?composer=${config.composer}&wiring=${config.wiring}&transport=fetch`
        );
        await expect(page.locator("#veilguard-badge")).toBeVisible({ timeout: 5000 });

        // Run N trials for benign control
        for (let i = 0; i < N_TRIALS; i++) {
          await resetServer(page.request);
          await setComposerText(page, config.composer, BENIGN_PROMPT);

          await triggerSubmission(page, pathType);

          // 1. Overlay must NOT appear
          const overlayTitle = page.locator("#veilguard-title");
          await expect(overlayTitle).not.toBeVisible();

          // 2. Server MUST have received exactly one message equal to benign text
          await expect.poll(
            async () => {
              const received = await getReceivedMessages(page.request);
              return received.length;
            },
            { timeout: 4000, intervals: [20, 50, 100] }
          ).toBe(1);

          const received = await getReceivedMessages(page.request);
          if (received.length === 1 && received[0].message === BENIGN_PROMPT) {
            benignDelivered++;
          }

          // Ensure browser has finished response handling and cleared the composer
          // before the next iteration sets new text
          if (config.composer === "textarea") {
            await expect(page.locator("#chat-composer-textarea")).toHaveValue("", { timeout: 3000 });
          } else {
            await expect(page.locator("#chat-composer-editable")).toHaveText("", { timeout: 3000 });
          }
        }

        benchmarkResults.push({
          composer: config.composer,
          wiring: config.wiring,
          path: pathType,
          transport: "fetch",
          flagged_trials: N_TRIALS,
          flagged_leaked: flaggedLeaked,
          benign_trials: N_TRIALS,
          benign_delivered_correctly: benignDelivered,
        });

        expect(flaggedLeaked).toBe(0);
        expect(benignDelivered).toBe(N_TRIALS);
      });
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Part B: MAIN-World Fetch / XHR Backstop
// ────────────────────────────────────────────────────────────────────────────

test.describe("Phase 1: Enforcement Spike (Part B - MAIN-World Backstop)", () => {
  let context: BrowserContext;
  let page: Page;

  const N_TRIALS = process.env.VG_TRIALS ? parseInt(process.env.VG_TRIALS, 10) : 20;

  test.beforeAll(async () => {
    const profileDir = path.resolve(ROOT_DIR, "test-results/.playwright-backstop-profile");
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_DIST}`,
        `--load-extension=${EXTENSION_DIST}`,
      ],
    });

    let [sw] = context.serviceWorkers();
    if (!sw) {
      await context.waitForEvent("serviceworker", { timeout: 10000 });
    }

    page = await context.newPage();
  });

  test.afterAll(async () => {
    // Read existing Part A results, append Part B cells, then rewrite
    let existing: { cells: ResultCell[]; [key: string]: unknown } = { cells: [] };
    try {
      existing = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
    } catch {
      // Fresh
    }

    const partBCells = benchmarkResults.filter(
      (c) => c.path === "programmatic_fetch" || c.path === "programmatic_xhr"
    );
    existing.cells = [...(existing.cells || []), ...partBCells];

    fs.writeFileSync(RESULTS_PATH, JSON.stringify(existing, null, 2), "utf-8");

    await page.close();
    await context.close();
  });

  for (const transport of ["fetch", "xhr"] as const) {
    test(`Backstop: programmatic ${transport.toUpperCase()} submission is blocked when flagged [N=${20}]`, async () => {
      let flaggedLeaked = 0;
      let benignDelivered = 0;

      const url = `http://127.0.0.1:4310/?composer=textarea&wiring=click&transport=${transport}`;
      await page.goto(url);

      // Wait for extension service worker and content script to settle
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("#veilguard-badge")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#veilguard-badge-text")).toHaveText(
        "VeilGuard: protection active"
      );

      // Flagged trials: click #send-programmatic with a flagged payload
      for (let i = 0; i < N_TRIALS; i++) {
        await resetServer(page.request);
        await setComposerText(page, "textarea", FLAGGED_PROMPT);

        // Click the programmatic button — triggers sendMessage() bypassing
        // DOM-level click/form submit listeners, goes direct to fetch/XHR
        await page.locator("#send-programmatic").click();

        // Backstop must have blocked: overlay appears via postMessage notification
        const overlayTitle = page.locator("#veilguard-title");
        await expect(overlayTitle).toBeVisible({ timeout: 3000 });

        // Server must have 0 messages
        const received = await getReceivedMessages(page.request);
        if (received.length > 0) {
          flaggedLeaked++;
        }

        // Dismiss
        await page.locator("#veilguard-dismiss-btn").click();
        await expect(overlayTitle).not.toBeVisible();
      }

      // Reload page before benign phase to reset app.js event listener state
      // accumulated across the 20 flagged+dismiss cycles above
      await page.goto(url);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("#veilguard-badge")).toBeVisible({ timeout: 5000 });

      // Benign trials: same programmatic path, benign text should deliver normally
      for (let i = 0; i < N_TRIALS; i++) {
        await resetServer(page.request);
        await setComposerText(page, "textarea", BENIGN_PROMPT);

        await page.locator("#send-programmatic").click();

        // Overlay must NOT appear
        const overlayTitle = page.locator("#veilguard-title");
        await expect(overlayTitle).not.toBeVisible();

        // Server must receive exactly one message
        await expect.poll(
          async () => {
            const received = await getReceivedMessages(page.request);
            return received.length;
          },
          { timeout: 4000, intervals: [20, 50, 100] }
        ).toBe(1);

        const received = await getReceivedMessages(page.request);
        if (received.length === 1 && received[0].message === BENIGN_PROMPT) {
          benignDelivered++;
        }

        // Wait for browser response handling to complete and clear composer
        await expect(page.locator("#chat-composer-textarea")).toHaveValue("", { timeout: 3000 });
      }

      benchmarkResults.push({
        composer: "textarea",
        wiring: "click",
        path: `programmatic_${transport}`,
        transport,
        flagged_trials: N_TRIALS,
        flagged_leaked: flaggedLeaked,
        benign_trials: N_TRIALS,
        benign_delivered_correctly: benignDelivered,
      });

      expect(flaggedLeaked).toBe(0);
      expect(benignDelivered).toBe(N_TRIALS);
    });
  }
});

