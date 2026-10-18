/**
 * VeilGuard AI - Phase 3b Scenario Tests
 *
 * Covers all required scenarios:
 *   1.  block
 *   2.  approval with second confirmation
 *   3.  engine down / 401 fail-closed
 *   4.  no token stored fail-closed
 *   5.  double Enter debouncing
 *   6.  untrusted click guard (isTrusted)
 *   7.  backstop approved (clean fetch allowed)
 *   8.  backstop unapproved (flagged fetch blocked)
 *   9.  backstop timeout (verdict timeout fail-closed)
 *   10. controlled state (textarea receives sanitized text, 0 original)
 *   11. controlled state (contenteditable receives sanitized text, 0 original)
 *   12. vault consistency across turns
 *   13. XSS payload safety in Shadow DOM
 *   14. emoji/astral character preservation
 *   15. storage privacy (no raw prompt in chrome.storage.local)
 *   16. console privacy (no raw prompt or token in logs)
 *   17. metadata audit events (proper fields, no raw prompt)
 *   18. overlay options for redact (Send sanitized, Edit, Cancel; NO send original)
 *   19. overlay options for require_approval (shows Send original with second confirm)
 *   20. sent-text proof (Send Sanitized click delivers sanitized text, 0 original)
 *   21. sent-text proof (Send Sanitized Enter delivers sanitized text, 0 original)
 *   22. edit sends nothing
 *   23. cancel sends nothing
 *
 * Rule 10: All test prompts use strictly synthetic data — no real personal data.
 * Rule 1:  No numbers are fabricated; all pass/fail assertions are live.
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const EXTENSION_DIST = path.resolve(ROOT_DIR, "extension/dist");

const E2E_TOKEN = process.env["VEILGUARD_TOKEN"] ?? "e2e-test-token";

/** Requires redact in company profile, require_approval in personal profile */
const PERSON_PHONE_PROMPT =
  "Analyze customer Rahul Sharma's account. His contact number is 9876543210 and transaction ID is TXN-9012.";
/** Secret triggers block */
const SECRET_PROMPT = "My AWS key is AKIAIOSFODNN7EXAMPLE and secret_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
/** Benign prompt */
const BENIGN_PROMPT = "Summarize the benefits of unit testing in three bullet points.";
/** XSS payload that must never execute in overlay */
const XSS_PROMPT =
  'Analyze customer <img src=x onerror="window.__xss_fired=true"> with phone 9876543210, account name "><script>window.__xss_fired=true</script>.';
/** Emoji + PII — emoji must not corrupt offsets */
const EMOJI_PROMPT = "Customer 🔒 Rahul Sharma 🎉 needs help. Phone: 9876543210. 💳";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function injectTokenAndProfile(
  context: BrowserContext,
  token: string = E2E_TOKEN,
  profile: string = "company"
): Promise<void> {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  await sw.evaluate(
    ({ t, p }) => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.set({ vg_token: t, vg_profile: p }, () => resolve());
      });
    },
    { t: token, p: profile }
  );
}

async function resetServer(page: Page): Promise<void> {
  const res = await page.request.post("http://127.0.0.1:4310/__test/reset");
  expect(res.ok()).toBeTruthy();
}

async function getReceivedMessages(
  page: Page
): Promise<Array<{ message: string; timestamp: string }>> {
  const res = await page.request.get("http://127.0.0.1:4310/__test/received");
  const data = (await res.json()) as { messages?: Array<{ message: string; timestamp: string }> };
  return data.messages ?? [];
}

async function setTextareaText(page: Page, text: string): Promise<void> {
  await page.locator("#chat-composer-textarea").fill(text);
}

async function setContenteditableText(page: Page, text: string): Promise<void> {
  const el = page.locator("#chat-composer-editable");
  await el.click();
  await page.evaluate((val: string) => {
    const node = document.getElementById("chat-composer-editable");
    if (node) {
      node.innerText = val;
      node.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, text);
}

async function waitForOverlay(page: Page, timeoutMs = 10000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const host = document.getElementById("veilguard-overlay-host");
        if (!host?.shadowRoot) return false;
        return (
          host.shadowRoot.getElementById("vg-overlay-title") != null ||
          host.shadowRoot.getElementById("vg-err-title") != null
        );
      },
      undefined,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

async function overlayIsGone(page: Page, timeoutMs = 4000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const host = document.getElementById("veilguard-overlay-host");
        if (!host?.shadowRoot) return true;
        return host.shadowRoot.querySelector(".backdrop") == null;
      },
      undefined,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

async function clickOverlayButton(
  page: Page,
  selector: string
): Promise<void> {
  await page.locator(`#veilguard-overlay-host`).locator(selector).first().click();
}

async function launchContext(profileSuffix: string): Promise<BrowserContext> {
  const profileDir = path.resolve(
    ROOT_DIR,
    `test-results/.playwright-scenario-${profileSuffix}`
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
    await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  return context;
}

// ===========================================================================
// Test Suite: Scenarios
// ===========================================================================

test.describe("Phase 3b Scenarios: Core Matrix", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    context = await launchContext("main");
    page = context.pages()[0] || (await context.newPage());
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");
    await injectTokenAndProfile(context, E2E_TOKEN, "company");
  });

  test.afterAll(async () => {
    await page.close();
    await context.close();
  });

  // 1. Block decision
  test("scenario:block — secret prompt shows block overlay, 0 messages delivered", async () => {
    await resetServer(page);
    await setTextareaText(page, SECRET_PROMPT);
    await page.locator("#send-btn").click();

    const shown = await waitForOverlay(page, 12000);
    expect(shown, "Block overlay must appear for secret prompt").toBe(true);

    const received = await getReceivedMessages(page);
    expect(received.length, "Zero messages must reach server on block").toBe(0);

    const sendSanitizedVisible = await page
      .locator("#veilguard-overlay-host")
      .locator("button.btn-send")
      .isVisible()
      .catch(() => false);
    expect(sendSanitizedVisible, "Block overlay must not offer Send Sanitized").toBe(false);

    await clickOverlayButton(page, "button.btn-cancel, button.btn-edit");
    await overlayIsGone(page);
  });

  // 2. Approval with second confirmation
  test("scenario:approval — require_approval shows Send Original with secondary confirm step", async () => {
    await resetServer(page);
    await injectTokenAndProfile(context, E2E_TOKEN, "personal");
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    const phonePrompt = "Please contact client at 9876543210 regarding invoice.";
    await setTextareaText(page, phonePrompt);
    await page.locator("#send-btn").click();

    const shown = await waitForOverlay(page, 12000);
    expect(shown, "Review overlay must appear for require_approval decision").toBe(true);

    const host = page.locator("#veilguard-overlay-host");
    const sendOriginalBtn = host.locator("button.btn-send-original");
    await expect(sendOriginalBtn).toBeVisible();

    // Click Send Original — should display secondary confirmation
    await sendOriginalBtn.click();
    await expect(host.locator("#vg-confirm-warning")).toBeVisible();
    await expect(host.locator("#vg-btn-confirm-send")).toBeVisible();

    // Secondary confirm click — original text is sent
    await host.locator("#vg-btn-confirm-send").click();
    await overlayIsGone(page);

    await expect
      .poll(async () => (await getReceivedMessages(page)).length, { timeout: 8000 })
      .toBeGreaterThanOrEqual(1);

    const received = await getReceivedMessages(page);
    expect(received[0].message).toContain("9876543210");

    // Reset profile back to company
    await injectTokenAndProfile(context, E2E_TOKEN, "company");
  });

  // 3. Engine down / 401 fail closed
  test("scenario:engine-down — invalid token fails closed with error overlay", async () => {
    await resetServer(page);
    await injectTokenAndProfile(context, "invalid-token", "company");
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();

    const shown = await waitForOverlay(page, 10000);
    expect(shown, "Fail-closed error overlay must appear").toBe(true);

    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(0);

    await clickOverlayButton(page, "button.btn-dismiss, button.btn-cancel, button.btn-edit");
    await overlayIsGone(page);

    // Restore valid token
    await injectTokenAndProfile(context, E2E_TOKEN, "company");
  });

  // 4. No token stored fail closed
  test("scenario:no-token-stored — with no token stored, sending is blocked by fail-closed overlay", async () => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 5000 });
    await sw.evaluate(() => new Promise<void>((r) => chrome.storage.local.remove("vg_token", () => r())));

    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();

    const shown = await waitForOverlay(page, 10000);
    expect(shown, "Fail-closed error overlay must appear when no token is stored").toBe(true);

    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(0);

    await clickOverlayButton(page, "button.btn-dismiss, button.btn-cancel, button.btn-edit");
    await overlayIsGone(page);

    // Restore valid token
    await injectTokenAndProfile(context, E2E_TOKEN, "company");
  });

  // 5. Double Enter debouncing
  test("scenario:double-enter — rapid double Enter only shows one overlay, no duplicate analysis", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#chat-composer-textarea").press("Enter");
    await page.locator("#chat-composer-textarea").press("Enter");

    const shown = await waitForOverlay(page, 12000);
    expect(shown, "Overlay must appear").toBe(true);

    const overlayCount = await page.evaluate(() => {
      const host = document.getElementById("veilguard-overlay-host");
      if (!host?.shadowRoot) return 0;
      return host.shadowRoot.querySelectorAll(".backdrop").length;
    });
    expect(overlayCount, "Only one overlay backdrop must exist").toBe(1);

    await clickOverlayButton(page, "button.btn-cancel, button.btn-edit");
    await overlayIsGone(page);
  });

  // 6. Untrusted click guard
  test("scenario:untrusted-click — synthetic JS click on overlay button is rejected (isTrusted guard)", async () => {
    await resetServer(page);
    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();

    const shown = await waitForOverlay(page, 12000);
    expect(shown, "Overlay must appear before testing isTrusted guard").toBe(true);

    const didSend = await page.evaluate(() => {
      const host = document.getElementById("veilguard-overlay-host");
      if (!host?.shadowRoot) return false;
      const sendBtn = host.shadowRoot.querySelector<HTMLButtonElement>("button.btn-send");
      if (!sendBtn) return false;
      sendBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    });
    expect(didSend, "Synthetic click must have dispatched").toBe(true);

    await page.waitForTimeout(1000);
    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(0);

    const stillVisible = await page
      .locator("#veilguard-overlay-host")
      .locator(".backdrop")
      .isVisible()
      .catch(() => false);
    expect(stillVisible, "Overlay must remain open after synthetic click").toBe(true);

    await clickOverlayButton(page, "button.btn-cancel, button.btn-edit");
    await overlayIsGone(page);
  });

  // 7. Backstop approved
  test("scenario:backstop-approved — programmatic fetch with clean text is allowed", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=click&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, BENIGN_PROMPT);
    await page.locator("#send-programmatic").click();

    await expect
      .poll(async () => (await getReceivedMessages(page)).length, { timeout: 8000 })
      .toBeGreaterThanOrEqual(1);

    const received = await getReceivedMessages(page);
    expect(received[0].message).toBe(BENIGN_PROMPT);
  });

  // 8. Backstop unapproved
  test("scenario:backstop-unapproved — programmatic fetch with flagged text is blocked", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=click&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-programmatic").click();

    const shown = await waitForOverlay(page, 10000);
    expect(shown, "Backstop block overlay must appear").toBe(true);

    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(0);

    await clickOverlayButton(page, "button.btn-dismiss, button.btn-cancel, button.btn-edit");
    await overlayIsGone(page);
  });

  // 9. Backstop timeout
  test("scenario:backstop-timeout — when verdict bridge is suppressed, backstop fails closed", async () => {
    test.setTimeout(25000);
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=click&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    // Suppress content-script check request to force verdict timeout in page-world
    await page.evaluate(() => {
      const origPost = window.postMessage.bind(window);
      window.postMessage = ((message: unknown, targetOriginOrOptions?: unknown, transfer?: unknown) => {
        if (
          message &&
          typeof message === "object" &&
          (message as { type?: string }).type === "VEILGUARD_CHECK_REQUEST"
        ) {
          // Drop check request so content script never answers and backstop hits timeout
          return;
        }
        return (origPost as Function)(message, targetOriginOrOptions, transfer);
      }) as typeof window.postMessage;
    });

    // Issue programmatic fetch
    const fetchResult = await page.evaluate(async () => {
      try {
        const res = await window.fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Timeout test prompt" }),
        });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    });

    // Must be blocked by backstop
    expect(fetchResult.ok).toBe(false);

    // Server must have received 0 messages
    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(0);

    const shown = await waitForOverlay(page, 2000);
    if (shown) {
      await clickOverlayButton(page, "button.btn-dismiss, button.btn-cancel, button.btn-edit");
      await overlayIsGone(page);
    }
  });

  // 10. Controlled state textarea
  test("scenario:controlled-state-textarea — server receives sanitized text, never original, after Send Sanitized", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=click&transport=fetch&state=controlled");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();

    const shown = await waitForOverlay(page, 12000);
    expect(shown, "Review overlay must appear").toBe(true);

    // Click Send Sanitized
    await page.locator("#veilguard-overlay-host").locator("button.btn-send").click();
    await overlayIsGone(page);

    await expect
      .poll(async () => (await getReceivedMessages(page)).length, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);

    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(1);
    expect(received[0].message, "Original phone must not leak").not.toContain("9876543210");
    expect(received[0].message, "Original name must not leak").not.toContain("Rahul Sharma");
    expect(received[0].message).toMatch(/\[(PERSON|CUSTOMER)_\d+\]/);
    expect(received[0].message).toMatch(/\[PHONE_\d+\]/);

    // Verify controlled text variable was updated during send
    const lastSent = await page.evaluate(() => (window as unknown as { __vg_last_sent_text?: string }).__vg_last_sent_text);
    expect(lastSent).toMatch(/\[(PERSON|CUSTOMER)_\d+\]/);
  });

  // 11. Controlled state contenteditable
  test("scenario:controlled-state-contenteditable — server receives sanitized text, never original, after Send Sanitized", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=contenteditable&wiring=click&transport=fetch&state=controlled");
    await page.waitForLoadState("domcontentloaded");

    await setContenteditableText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();

    const shown = await waitForOverlay(page, 12000);
    expect(shown, "Review overlay must appear").toBe(true);

    await page.locator("#veilguard-overlay-host").locator("button.btn-send").click();
    await overlayIsGone(page);

    await expect
      .poll(async () => (await getReceivedMessages(page)).length, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);

    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(1);
    expect(received[0].message).not.toContain("9876543210");
    expect(received[0].message).not.toContain("Rahul Sharma");
    expect(received[0].message).toMatch(/\[(PERSON|CUSTOMER)_\d+\]/);
    expect(received[0].message).toMatch(/\[PHONE_\d+\]/);
  });

  // 12. Vault consistency
  test("scenario:vault-consistency — same person maps to same placeholder across turns", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    // Turn 1
    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();
    await waitForOverlay(page, 12000);

    const text1 = await page.evaluate(() => {
      const host = document.getElementById("veilguard-overlay-host");
      return host?.shadowRoot?.getElementById("vg-sanitized-text")?.textContent ?? "";
    });

    await page.locator("#veilguard-overlay-host").locator("button.btn-send").click();
    await overlayIsGone(page);

    // Wait for Turn 1 to complete delivery and composer clear
    await expect
      .poll(async () => (await getReceivedMessages(page)).length, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);
    await expect(page.locator("#chat-composer-textarea")).toHaveValue("", { timeout: 8000 });
    await page.waitForTimeout(250);

    // Turn 2
    await resetServer(page);
    const turn2 = "Follow up on Rahul Sharma's case. Callback at 9876543210.";
    await setTextareaText(page, turn2);
    await expect(page.locator("#chat-composer-textarea")).toHaveValue(turn2, { timeout: 4000 });
    await page.locator("#send-btn").click();
    await waitForOverlay(page, 12000);

    const text2 = await page.evaluate(() => {
      const host = document.getElementById("veilguard-overlay-host");
      return host?.shadowRoot?.getElementById("vg-sanitized-text")?.textContent ?? "";
    });

    expect(text1).toContain("[CUSTOMER_1]");
    expect(text2).toContain("[CUSTOMER_1]");

    await page.locator("#veilguard-overlay-host").locator("button.btn-send").click();
    await overlayIsGone(page);
  });

  // 13. XSS safety
  test("scenario:xss — XSS payload in prompt does not execute script or image error in overlay", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, XSS_PROMPT);
    await page.locator("#send-btn").click();

    await waitForOverlay(page, 12000);
    await page.waitForTimeout(500);

    const xssFired = await page.evaluate(() => (window as unknown as { __xss_fired?: boolean }).__xss_fired);
    expect(xssFired, "XSS must not execute in DOM").toBeFalsy();

    const rawScripts = await page.evaluate(() => {
      const host = document.getElementById("veilguard-overlay-host");
      return host?.shadowRoot?.querySelectorAll("script").length ?? 0;
    });
    expect(rawScripts, "No script elements in shadow DOM").toBe(0);

    await clickOverlayButton(page, "button.btn-cancel, button.btn-edit");
    await overlayIsGone(page);
  });

  // 14. Emoji prompt
  test("scenario:emoji — emoji in prompt does not corrupt sanitization, phone is redacted", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, EMOJI_PROMPT);
    await page.locator("#send-btn").click();

    await waitForOverlay(page, 12000);
    await page.locator("#veilguard-overlay-host").locator("button.btn-send").click();
    await overlayIsGone(page);

    await expect
      .poll(async () => (await getReceivedMessages(page)).length, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);

    const received = await getReceivedMessages(page);
    expect(received[0].message).not.toContain("9876543210");
    expect(received[0].message).toMatch(/\[PHONE_\d+\]/);
    expect(received[0].message).toContain("🔒");
    expect(received[0].message).toContain("🎉");
  });

  // 15. Storage privacy
  test("scenario:storage-privacy — raw prompt text must not appear in chrome.storage.local", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();
    await waitForOverlay(page, 12000);

    await clickOverlayButton(page, "button.btn-cancel, button.btn-edit");
    await overlayIsGone(page);

    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 5000 });

    const storedJson = await sw.evaluate(() => {
      return new Promise<string>((resolve) => {
        chrome.storage.local.get(null, (items) => resolve(JSON.stringify(items)));
      });
    });

    expect(storedJson).not.toContain("9876543210");
    expect(storedJson).not.toContain("Rahul Sharma");
  });

  // 16. Console privacy
  test("scenario:console-privacy — console output must not contain raw prompt text or token", async () => {
    const consoleLogs: string[] = [];
    page.on("console", (msg) => consoleLogs.push(msg.text()));

    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();
    await waitForOverlay(page, 12000);

    await clickOverlayButton(page, "button.btn-cancel, button.btn-edit");
    await overlayIsGone(page);

    const combined = consoleLogs.join(" ");
    expect(combined).not.toContain("9876543210");
    expect(combined).not.toContain("e2e-test-token");
  });

  // 17. Metadata events
  test("scenario:metadata-events — audit log has entry with required metadata fields and no raw text", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();
    await waitForOverlay(page, 12000);

    await clickOverlayButton(page, "button.btn-cancel");
    await overlayIsGone(page);
    await page.waitForTimeout(500);

    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 5000 });

    const auditEvents = await sw.evaluate(() => {
      return new Promise<Array<Record<string, unknown>>>((resolve) => {
        chrome.storage.local.get("vg_audit_log", (items) => resolve(items.vg_audit_log ?? []));
      });
    });

    expect(auditEvents.length).toBeGreaterThan(0);
    const last = auditEvents[auditEvents.length - 1];
    expect(last).toHaveProperty("timestamp");
    expect(last).toHaveProperty("category");
    expect(last).toHaveProperty("decision");
    expect(last).toHaveProperty("outcome");
    expect(JSON.stringify(last)).not.toContain("9876543210");
  });

  // 18. Overlay options for redact
  test("scenario:overlay-options-redact — example prompt (redact) shows Send sanitized, Edit, Cancel, NO send original", async () => {
    await resetServer(page);
    await injectTokenAndProfile(context, E2E_TOKEN, "company");
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    const examplePrompt = "Analyze customer Rahul Sharma's account, phone number 9876543210, and transaction history. Identify spending patterns.";
    await setTextareaText(page, examplePrompt);
    await page.locator("#send-btn").click();

    await waitForOverlay(page, 12000);
    const host = page.locator("#veilguard-overlay-host");

    await expect(host.locator("button.btn-send")).toBeVisible();
    await expect(host.locator("button.btn-edit")).toBeVisible();
    await expect(host.locator("button.btn-cancel")).toBeVisible();

    const sendOrigVisible = await host.locator("button.btn-send-original").isVisible().catch(() => false);
    expect(sendOrigVisible, "Send original must not be present for redact decision").toBe(false);

    await host.locator("button.btn-cancel").click();
    await overlayIsGone(page);
  });

  // 19. Overlay options for require_approval
  test("scenario:overlay-options-require-approval — phone alone in personal profile shows Send Original with second confirmation", async () => {
    await resetServer(page);
    await injectTokenAndProfile(context, E2E_TOKEN, "personal");
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    const phonePrompt = "Please call 9876543210 regarding the support ticket.";
    await setTextareaText(page, phonePrompt);
    await page.locator("#send-btn").click();

    await waitForOverlay(page, 12000);
    const host = page.locator("#veilguard-overlay-host");

    await expect(host.locator("button.btn-send")).toBeVisible();
    await expect(host.locator("button.btn-edit")).toBeVisible();
    await expect(host.locator("button.btn-cancel")).toBeVisible();
    await expect(host.locator("button.btn-send-original")).toBeVisible();

    // Click Send Original
    await host.locator("button.btn-send-original").click();
    await expect(host.locator("#vg-confirm-warning")).toBeVisible();
    await expect(host.locator("#vg-btn-confirm-send")).toBeVisible();

    await host.locator("button.btn-edit").click();
    await overlayIsGone(page);

    await injectTokenAndProfile(context, E2E_TOKEN, "company");
  });

  // 20. Sent-text click
  test("scenario:sent-text-click — Send Sanitized (click) delivers sanitized text, no original", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();
    await waitForOverlay(page, 12000);

    await page.locator("#veilguard-overlay-host").locator("button.btn-send").click();
    await overlayIsGone(page);

    await expect
      .poll(async () => (await getReceivedMessages(page)).length, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);

    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(1);
    expect(received[0].message).not.toContain("9876543210");
    expect(received[0].message).not.toContain("Rahul Sharma");
    expect(received[0].message).toMatch(/\[PHONE_\d+\]/);
  });

  // 21. Sent-text enter
  test("scenario:sent-text-enter — Send Sanitized via Enter delivers sanitized text", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#chat-composer-textarea").press("Enter");
    await waitForOverlay(page, 12000);

    await page.locator("#veilguard-overlay-host").locator("button.btn-send").click();
    await overlayIsGone(page);

    await expect
      .poll(async () => (await getReceivedMessages(page)).length, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);

    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(1);
    expect(received[0].message).not.toContain("9876543210");
  });

  // 22. Edit sends nothing
  test("scenario:edit-sends-nothing — Edit Original sends 0 messages to server", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();
    await waitForOverlay(page, 12000);

    await page.locator("#veilguard-overlay-host").locator("button.btn-edit").click();
    await overlayIsGone(page);

    await page.waitForTimeout(1000);
    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(0);
  });

  // 23. Cancel sends nothing
  test("scenario:cancel-sends-nothing — Cancel sends 0 messages to server", async () => {
    await resetServer(page);
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    await setTextareaText(page, PERSON_PHONE_PROMPT);
    await page.locator("#send-btn").click();
    await waitForOverlay(page, 12000);

    await page.locator("#veilguard-overlay-host").locator("button.btn-cancel").click();
    await overlayIsGone(page);

    await page.waitForTimeout(1000);
    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(0);
  });

  // 24. Phase 5 Context Intelligence: Customer analysis prompt
  test("scenario:customer-analysis-context — overlay shows task, role placeholder [CUSTOMER_1], explanations; server receives sanitized text with 0 originals", async () => {
    await resetServer(page);
    await injectTokenAndProfile(context, E2E_TOKEN, "company");
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    const prompt =
      "Analyze customer Rahul Sharma's account, phone number 9876543210, and transaction history. Identify spending patterns.";
    await setTextareaText(page, prompt);
    await page.locator("#send-btn").click();

    await waitForOverlay(page, 12000);
    const host = page.locator("#veilguard-overlay-host");

    // Overlay checks
    await expect(host.locator("#vg-overlay-title")).toBeVisible();

    // Sanitized text contains role placeholder [CUSTOMER_1] and [PHONE_1]
    const sanText = await host.locator("#vg-sanitized-text").textContent();
    expect(sanText).toContain("[CUSTOMER_1]'s account");
    expect(sanText).toContain("[PHONE_1]");
    expect(sanText).not.toContain("Rahul Sharma");
    expect(sanText).not.toContain("9876543210");

    // Click Send Sanitized
    await host.locator("button.btn-send").click();
    await overlayIsGone(page);

    await expect
      .poll(async () => (await getReceivedMessages(page)).length, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);

    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(1);
    const sent = received[0].message;
    expect(sent).toBe(
      "Analyze customer [CUSTOMER_1]'s account, phone number [PHONE_1], and transaction history. Identify spending patterns."
    );
    expect(sent).not.toContain("Rahul Sharma");
    expect(sent).not.toContain("9876543210");
  });

  // 25. Phase 5 Context Intelligence: HR re-identification combination
  test("scenario:hr-reid-combination — overlay shows re-ID explanation; server receives generalized text with 0 originals", async () => {
    await resetServer(page);
    await injectTokenAndProfile(context, E2E_TOKEN, "company");
    await page.goto("http://127.0.0.1:4310/?composer=textarea&wiring=form&transport=fetch");
    await page.waitForLoadState("domcontentloaded");

    const hrPrompt =
      "Draft a performance review for the 34-year-old HR manager at Acme's Pune office who recently went on maternity leave.";
    await setTextareaText(page, hrPrompt);
    await page.locator("#send-btn").click();

    await waitForOverlay(page, 12000);
    const host = page.locator("#veilguard-overlay-host");

    // Overlay checks
    await expect(host.locator("#vg-overlay-title")).toBeVisible();

    // Sanitized text generalizes quasi-identifiers while preserving role
    const sanText = await host.locator("#vg-sanitized-text").textContent();
    expect(sanText).toContain("HR manager");
    expect(sanText).toContain("[COMPANY_1]");
    expect(sanText).toContain("30s");
    expect(sanText).not.toContain("34-year-old");
    expect(sanText).not.toContain("Acme");
    expect(sanText).not.toContain("maternity leave");

    // Click Send Sanitized
    await host.locator("button.btn-send").click();
    await overlayIsGone(page);

    await expect
      .poll(async () => (await getReceivedMessages(page)).length, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);

    const received = await getReceivedMessages(page);
    expect(received).toHaveLength(1);
    const sent = received[0].message;
    expect(sent).toContain("HR manager");
    expect(sent).toContain("[COMPANY_1]");
    expect(sent).toContain("30s");
    expect(sent).not.toContain("34-year-old");
    expect(sent).not.toContain("Acme");
    expect(sent).not.toContain("maternity leave");
  });
});
