/**
 * VeilGuard Web Demo - Sealed Benchmark Explorer
 *
 * Visualizes empirical evaluation results across Regex Baseline, Presidio,
 * and VeilGuard AI on frozen, sealed test split (N=286 synthetic records).
 */

import React from "react";

interface BenchmarkRow {
  system: string;
  isVeilGuard?: boolean;
  entityF1: string;
  exactF1: string;
  flaggedPrecision: string;
  flaggedRecall: string;
  fpr: string;
  comboRecall: string;
  requiredRetained: string;
}

const BENCHMARK_DATA: BenchmarkRow[] = [
  {
    system: "Regex Baseline",
    entityF1: "56.3%",
    exactF1: "51.4%",
    flaggedPrecision: "97.3%",
    flaggedRecall: "79.2%",
    fpr: "3.9%",
    comboRecall: "17.1%",
    requiredRetained: "96.7%",
  },
  {
    system: "Microsoft Presidio",
    entityF1: "22.6%",
    exactF1: "22.3%",
    flaggedPrecision: "60.5%",
    flaggedRecall: "72.7%",
    fpr: "84.5%",
    comboRecall: "97.1%",
    requiredRetained: "63.5%",
  },
  {
    system: "VeilGuard (Type-Based)",
    entityF1: "43.4%",
    exactF1: "41.3%",
    flaggedPrecision: "100.0%",
    flaggedRecall: "56.8%",
    fpr: "0.0%",
    comboRecall: "0.0%",
    requiredRetained: "100.0%",
  },
  {
    system: "VeilGuard AI (Full Intelligence)",
    isVeilGuard: true,
    entityF1: "73.2%",
    exactF1: "65.3%",
    flaggedPrecision: "100.0%",
    flaggedRecall: "84.2%",
    fpr: "0.0%",
    comboRecall: "80.0%",
    requiredRetained: "100.0%",
  },
];

export const BenchmarkExplorer: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* 4 Metric Headline Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 backdrop-blur-md shadow-lg">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Entity F1 Score
          </span>
          <span className="text-3xl font-extrabold font-mono text-sky-400">73.2%</span>
          <p className="text-xs text-slate-400 mt-1.5">
            +16.9% over Regex baseline; +50.6% over Stock Presidio.
          </p>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 backdrop-blur-md shadow-lg">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            False Positive Rate
          </span>
          <span className="text-3xl font-extrabold font-mono text-emerald-400">0.0%</span>
          <p className="text-xs text-slate-400 mt-1.5">
            0 of 103 benign code/query prompts flagged unnecessarily.
          </p>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 backdrop-blur-md shadow-lg">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Quasi-ID Combo Recall
          </span>
          <span className="text-3xl font-extrabold font-mono text-cyan-400">80.0%</span>
          <p className="text-xs text-slate-400 mt-1.5">
            Intercepts multi-attribute re-identification attacks.
          </p>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5 backdrop-blur-md shadow-lg">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Required Retained
          </span>
          <span className="text-3xl font-extrabold font-mono text-indigo-300">100.0%</span>
          <p className="text-xs text-slate-400 mt-1.5">
            Zero destruction of task-essential reasoning tokens.
          </p>
        </div>
      </div>

      {/* Benchmark Matrix Table */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-xl space-y-4">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            Empirical Results on Cryptographically Sealed Test Split (N=286)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Strictly synthetic benchmark corpus evaluated across all four privacy frameworks under identical ground truth conditions.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-3">System</th>
                <th className="py-3 px-3">Entity F1 (50% IoU)</th>
                <th className="py-3 px-3">Exact Entity F1</th>
                <th className="py-3 px-3">Flagged Precision</th>
                <th className="py-3 px-3">Flagged Recall</th>
                <th className="py-3 px-3">False Positive Rate (FPR)</th>
                <th className="py-3 px-3">Quasi-ID Combo Recall</th>
                <th className="py-3 px-3">Required Retained</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] font-mono">
              {BENCHMARK_DATA.map((row) => (
                <tr
                  key={row.system}
                  className={`transition-colors ${
                    row.isVeilGuard
                      ? "bg-sky-500/[0.08] text-white font-bold"
                      : "text-slate-300 hover:bg-white/[0.02]"
                  }`}
                >
                  <td className="py-3 px-3 font-sans font-semibold flex items-center gap-2">
                    {row.isVeilGuard && (
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                    )}
                    {row.system}
                  </td>
                  <td className="py-3 px-3">{row.entityF1}</td>
                  <td className="py-3 px-3">{row.exactF1}</td>
                  <td className="py-3 px-3">{row.flaggedPrecision}</td>
                  <td className="py-3 px-3">{row.flaggedRecall}</td>
                  <td className={`py-3 px-3 ${row.fpr === "0.0%" ? "text-emerald-400 font-bold" : "text-rose-400"}`}>
                    {row.fpr}
                  </td>
                  <td className="py-3 px-3">{row.comboRecall}</td>
                  <td className="py-3 px-3 text-emerald-300">{row.requiredRetained}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Note on FPR trade-offs */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-slate-300 leading-relaxed space-y-1.5">
          <span className="font-semibold text-white block">Note on False Positive Rate &amp; Combination Recall:</span>
          <p>
            VeilGuard achieves <strong className="text-emerald-400">0.0% FPR</strong> (0 of 103 benign items flagged, 95% Wilson CI [0.0%, 3.6%])
            through deterministic policy rules (<code className="text-sky-300 bg-sky-950/60 px-1 rounded">allow_person_alone</code>, <code className="text-sky-300 bg-sky-950/60 px-1 rounded">allow_benign_code</code>),
            checksum verification, and task necessity gating.
          </p>
          <p className="text-slate-400">
            Stock Presidio's 97.1% combination recall is driven by an 84.5% false positive rate (flagging 87 of 103 benign prompts indiscriminately),
            whereas VeilGuard achieves 80.0% combination recall with zero false positives.
          </p>
        </div>
      </div>
    </div>
  );
};
