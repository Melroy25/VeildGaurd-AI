import { defineConfig } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * VeilGuard AI - Phase 4 Real-Site Playwright Configuration
 *
 * Rules:
 *  - Excluded from standard test:e2e and CI (Rule 26).
 *  - Uses persistent context at .playwright-real-profile/ (Rule 24).
 *  - 100% of outbound chat traffic is intercepted with page.route (Rule 22).
 */

export default defineConfig({
  testDir: "./tests/e2e-real",
  timeout: 120000,
  retries: 0,
  workers: 1,
  webServer: [
    {
      command: "node mock-ai-site/server.mjs",
      url: "http://127.0.0.1:4310/",
      reuseExistingServer: true,
      timeout: 15000,
    },
    {
      command: "node scripts/launch-engine-e2e.mjs",
      url: "http://127.0.0.1:8765/health",
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
  use: {
    headless: false,
    trace: "on-first-retry",
  },
});
