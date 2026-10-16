import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  retries: 0,
  workers: 1,
  webServer: {
    command: "node mock-ai-site/server.mjs",
    url: "http://127.0.0.1:4310/",
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
  use: {
    trace: "on-first-retry",
  },
});
