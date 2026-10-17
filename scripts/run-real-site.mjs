/**
 * VeilGuard AI - Real-Site Test Runner
 *
 * Sets VG_REAL_SITE=1 and invokes Playwright with playwright.real.config.ts.
 */

import { spawn } from "child_process";

process.env["VG_REAL_SITE"] = "1";

const args = ["playwright", "test", "--config=playwright.real.config.ts", ...process.argv.slice(2)];
const cmd = process.platform === "win32" ? "npx.cmd" : "npx";

console.log(`[VeilGuard] Running real-site test suite with VG_REAL_SITE=1: ${cmd} ${args.join(" ")}`);

const child = spawn(cmd, args, {
  shell: true,
  stdio: "inherit",
  env: process.env,
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});
