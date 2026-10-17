import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const benchJsonPath = resolve(rootDir, "bench/results/benchmark_test.json");
const targetSummaryPath = resolve(
  rootDir,
  "extension/src/options/benchmark-summary.json"
);

export function generateBenchmarkSummary() {
  if (!existsSync(benchJsonPath)) {
    console.log(
      "[Benchmark Summary] bench/results/benchmark_test.json not found, skipping."
    );
    return;
  }

  const raw = JSON.parse(readFileSync(benchJsonPath, "utf-8"));
  const meta = raw.meta || {};
  const systems = raw.systems || {};

  const summary = {
    dataset_size: meta.n || 0,
    date: new Date().toISOString().split("T")[0],
    commit: meta.commit || "unknown",
    run_number: meta.test_run_number || 1,
    caveat:
      "Synthetic dataset, relative results. Not a real-world accuracy guarantee.",
    systems: Object.keys(systems).map((name) => {
      const s = systems[name];
      const em = s.entity_metrics || {};
      const fm = s.flagged_metrics || {};
      const lat = s.latency || {};
      return {
        name,
        entity_f1: +(em.f1 * 100).toFixed(1),
        flagged_recall: +(fm.recall * 100).toFixed(1),
        combo_recall: +(fm.combo_risk_recall * 100).toFixed(1),
        p50_latency_ms: +(lat.p50_ms ?? 0).toFixed(1),
      };
    }),
  };

  writeFileSync(targetSummaryPath, JSON.stringify(summary, null, 2) + "\n");
  console.log(`[Benchmark Summary] Wrote summary to ${targetSummaryPath}`);
}

if (process.argv[1] === __filename) {
  generateBenchmarkSummary();
}
