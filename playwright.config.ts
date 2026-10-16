import { defineConfig } from "@playwright/test";

/**
 * VeilGuard AI - Playwright Configuration
 *
 * Phase 3b adds a second webServer entry for the local Python privacy engine.
 * The engine is launched with a test-only token (VEILGUARD_TOKEN=e2e-test-token)
 * so E2E tests can authenticate without requiring the persistent .veilguard/token file.
 *
 * Note: Phase 1 enforcement-spike.spec.ts tests use the stub detector and are
 * retained for regression coverage. Phase 3b tests use the real engine.
 *
 * Decision 2: Playwright E2E tests run locally/on-demand, not in standard CI,
 * because they require a full Chromium binary and extension loading flags.
 */

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,     // Phase 3b: engine + extension round-trip needs more time
  retries: 0,
  workers: 1,         // Extension tests require serial execution (single context)
  webServer: [
    {
      command: "node mock-ai-site/server.mjs",
      url: "http://127.0.0.1:4310/",
      reuseExistingServer: !process.env["CI"],
      timeout: 15000,
    },
    {
      command: `node scripts/launch-engine-e2e.mjs`,
      url: "http://127.0.0.1:8765/health",
      reuseExistingServer: !process.env["CI"],
      timeout: 30000,
    },
  ],
  use: {
    trace: "on-first-retry",
  },
});
