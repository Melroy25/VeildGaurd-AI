/**
 * VeilGuard AI - Real-Site Login Helper (Phase 4 Part D)
 *
 * Ground Rules (AGENTS.md Rules 22-27):
 *  - Credentials belong strictly to the human.
 *  - This script opens a headed browser using the dedicated persistent profile
 *    directory (.playwright-real-profile/, gitignored).
 *  - The human manually solves any bot challenge or logs in.
 *  - The agent NEVER sees, types, logs, or stores credentials.
 */

import { chromium } from "@playwright/test";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const PROFILE_DIR = path.resolve(ROOT_DIR, ".playwright-real-profile");
const EXTENSION_DIST = path.resolve(ROOT_DIR, "extension/dist");

console.log("=================================================================");
console.log("  VeilGuard AI: Manual Real-Site Login & Session Setup");
console.log("=================================================================");
console.log(`Profile directory: ${PROFILE_DIR}`);
console.log("Opening browser at https://chatgpt.com ...");
console.log("");
console.log("INSTRUCTIONS FOR HUMAN OPERATOR:");
console.log(" 1. In the browser window that opens, complete any Cloudflare challenge.");
console.log(" 2. Log in with your credentials IF you want to test logged-in mode,");
console.log("    OR stay on the logged-out chat interface.");
console.log(" 3. When the ChatGPT composer is visible, return here and press ENTER.");
console.log("=================================================================\n");

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXTENSION_DIST}`,
    `--load-extension=${EXTENSION_DIST}`,
  ],
});

const page = context.pages()[0] || (await context.newPage());
await page.goto("https://chatgpt.com");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

await new Promise((resolve) => {
  rl.question("Press [ENTER] after completing verification/login to save profile: ", () => {
    rl.close();
    resolve();
  });
});

console.log("Closing browser and saving persistent session cookies...");
await context.close();
console.log("Done! Profile is ready for real-site testing.");
