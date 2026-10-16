/**
 * Launch the VeilGuard Python engine for E2E testing.
 * Sets VEILGUARD_TOKEN from process.env and spawns the engine.
 * Used by playwright.config.ts webServer.command.
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const token = process.env["VEILGUARD_TOKEN"] ?? "e2e-test-token";

const proc = spawn(
  path.join(rootDir, ".venv", "Scripts", "python.exe"),
  ["-m", "veilguard_engine"],
  {
    cwd: rootDir,
    env: { ...process.env, VEILGUARD_TOKEN: token },
    stdio: "inherit",
  }
);

proc.on("error", (err) => {
  console.error("[E2E Engine Launcher] Failed to start engine:", err.message);
  process.exit(1);
});

proc.on("exit", (code) => {
  process.exit(code ?? 0);
});

// Forward signals so Playwright can cleanly terminate the engine
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => proc.kill(sig));
}
