import React, { useState } from "react";

interface AuditEntry {
  id: string;
  timestamp: string;
  destination: string;
  profile: string;
  decision: "allow" | "redact" | "block";
  entities: string[];
  riskScore: number;
  task: string;
}

const SAMPLE_AUDIT_LOG: AuditEntry[] = [
  {
    id: "evt-901",
    timestamp: "Just now",
    destination: "chatgpt.com",
    profile: "company",
    decision: "redact",
    entities: ["AADHAAR_NUMBER", "PERSON"],
    riskScore: 0.82,
    task: "healthcare_patient",
  },
  {
    id: "evt-900",
    timestamp: "2 mins ago",
    destination: "codex / visual-studio-code",
    profile: "company",
    decision: "block",
    entities: ["AWS_ACCESS_KEY"],
    riskScore: 0.98,
    task: "code_debugging",
  },
  {
    id: "evt-899",
    timestamp: "6 mins ago",
    destination: "claude.ai",
    profile: "company",
    decision: "allow",
    entities: [],
    riskScore: 0.04,
    task: "general_analysis",
  },
  {
    id: "evt-898",
    timestamp: "14 mins ago",
    destination: "chatgpt.com",
    profile: "company",
    decision: "redact",
    entities: ["PAN_CARD", "IN_PHONE"],
    riskScore: 0.74,
    task: "financial_advisory",
  },
  {
    id: "evt-897",
    timestamp: "28 mins ago",
    destination: "cursor / claude-3.5",
    profile: "company",
    decision: "allow",
    entities: [],
    riskScore: 0.05,
    task: "code_refactor",
  },
  {
    id: "evt-896",
    timestamp: "45 mins ago",
    destination: "copilot",
    profile: "finance",
    decision: "redact",
    entities: ["CREDIT_CARD", "BANK_ACCOUNT"],
    riskScore: 0.91,
    task: "account_statement",
  },
  {
    id: "evt-895",
    timestamp: "1 hour ago",
    destination: "chatgpt.com",
    profile: "personal",
    decision: "redact",
    entities: ["MEDICAL_CONDITION", "PATIENT_ID"],
    riskScore: 0.88,
    task: "medical_consult",
  },
];

export const Dashboard: React.FC = () => {
  const [filterDecision, setFilterDecision] = useState<string>("all");
  const [filterDest, setFilterDest] = useState<string>("all");

  const filteredLog = SAMPLE_AUDIT_LOG.filter((item) => {
    if (filterDecision !== "all" && item.decision !== filterDecision) return false;
    if (filterDest !== "all" && !item.destination.toLowerCase().includes(filterDest.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-sky-950/40 via-slate-900/40 to-cyan-950/40 border border-sky-500/20 rounded-2xl p-6 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-xl font-bold text-white tracking-tight">Privacy Firewall Dashboard</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              LIVE METRICS
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Real-time metadata audit log, context-aware policy enforcement, and zero-egress telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-slate-300 flex items-center gap-2">
            <span className="text-slate-400">Target Host:</span>
            <span className="text-sky-400 font-mono font-semibold">127.0.0.1:8765</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-slate-300 flex items-center gap-2">
            <span className="text-slate-400">Active Profile:</span>
            <span className="text-emerald-400 font-semibold">Company Standard</span>
          </div>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 backdrop-blur-md hover:border-sky-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prompts Intercepted</span>
            <span className="text-sky-400 text-lg">🛡️</span>
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight">1,428</div>
          <div className="text-[11px] text-emerald-400 mt-2 font-medium flex items-center gap-1">
            <span>↑ 100% inspected at edge</span>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 backdrop-blur-md hover:border-amber-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">PII Leaks Prevented</span>
            <span className="text-amber-400 text-lg">⚠️</span>
          </div>
          <div className="text-3xl font-extrabold text-amber-300 tracking-tight">312</div>
          <div className="text-[11px] text-slate-400 mt-2 font-medium">
            Aadhaar, PAN, Cards, Medical
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 backdrop-blur-md hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Utility Preserved</span>
            <span className="text-emerald-400 text-lg">✨</span>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 tracking-tight">99.4%</div>
          <div className="text-[11px] text-slate-400 mt-2 font-medium">
            Contextual semantic placeholders
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 backdrop-blur-md hover:border-cyan-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Latency (p95)</span>
            <span className="text-cyan-400 text-lg">⚡</span>
          </div>
          <div className="text-3xl font-extrabold text-cyan-300 tracking-tight">18.2 ms</div>
          <div className="text-[11px] text-slate-400 mt-2 font-medium">
            Local loopback deterministic eval
          </div>
        </div>
      </div>

      {/* Detection Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Card: Category Breakdown */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <span>📊</span> Entity Risk Distribution
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">India Quasi-Identifiers (Aadhaar, PAN, Mobile)</span>
                <span className="text-sky-400 font-mono font-bold">142 (45%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full" style={{ width: "45%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Financial Data (Credit Cards, Bank A/C, UPI)</span>
                <span className="text-amber-400 font-mono font-bold">98 (31%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: "31%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Health &amp; Medical Context (Conditions, Rx)</span>
                <span className="text-emerald-400 font-mono font-bold">46 (15%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: "15%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Hard Secrets (API Keys, Passwords, Tokens)</span>
                <span className="text-red-400 font-mono font-bold">26 (9%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: "9%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Card: Protection Safeguards */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 backdrop-blur-md flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <span>🔒</span> Security &amp; Privacy Invariants
            </h3>
            <ul className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <div>
                  <strong className="text-white">Strictly Metadata-Only (Rule 7):</strong> Raw prompt text is never written to disk, persistent logs, or cloud storage.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <div>
                  <strong className="text-white">Zero External Telemetry (Rule 8):</strong> All risk analysis runs locally on 127.0.0.1. Zero bytes leave your machine.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <div>
                  <strong className="text-white">Fail-Closed Enforcement (Rule 6):</strong> If engine is down, submissions are blocked or warned, never silently leaked.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <div>
                  <strong className="text-white">Zero Keylogging Hooks (Rule 12):</strong> Desktop sidebar uses strictly passive foreground window state checks.
                </div>
              </li>
            </ul>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
            <span>Audit Log Format: Metadata V2</span>
            <span className="text-sky-400 font-mono">SHA-256 Validated</span>
          </div>
        </div>
      </div>

      {/* Real-Time Audit Log Table */}
      <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>📋</span> Metadata-Only Audit Trail
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Deterministic records of intercepted submissions across ChatGPT, Codex, Claude, and APIs.
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <select
              value={filterDecision}
              onChange={(e) => setFilterDecision(e.target.value)}
              className="bg-slate-900 border border-white/10 text-xs text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="all">All Decisions</option>
              <option value="allow">Allowed</option>
              <option value="redact">Redacted</option>
              <option value="block">Blocked</option>
            </select>

            <select
              value={filterDest}
              onChange={(e) => setFilterDest(e.target.value)}
              className="bg-slate-900 border border-white/10 text-xs text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="all">All Destinations</option>
              <option value="chatgpt">ChatGPT</option>
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
              <option value="cursor">Cursor</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="pb-3 px-3">Event ID</th>
                <th className="pb-3 px-3">Time</th>
                <th className="pb-3 px-3">Destination</th>
                <th className="pb-3 px-3">Inferred Task</th>
                <th className="pb-3 px-3">Entities Detected</th>
                <th className="pb-3 px-3">Risk</th>
                <th className="pb-3 px-3">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredLog.map((row) => (
                <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-3 font-mono text-slate-400">{row.id}</td>
                  <td className="py-3 px-3 text-slate-400">{row.timestamp}</td>
                  <td className="py-3 px-3 font-medium text-white">{row.destination}</td>
                  <td className="py-3 px-3 text-slate-300 font-mono text-[11px]">{row.task}</td>
                  <td className="py-3 px-3">
                    {row.entities.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.entities.map((ent, idx) => (
                          <span
                            key={idx}
                            className="bg-sky-950/80 border border-sky-500/30 text-sky-300 font-mono text-[10px] px-1.5 py-0.5 rounded"
                          >
                            {ent}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[11px]">None (Clean)</span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono">
                    <span
                      className={
                        row.riskScore >= 0.8
                          ? "text-red-400 font-bold"
                          : row.riskScore >= 0.4
                          ? "text-amber-400 font-bold"
                          : "text-emerald-400 font-bold"
                      }
                    >
                      {row.riskScore.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {row.decision === "allow" && (
                      <span className="inline-flex items-center gap-1 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold text-[10px] uppercase px-2 py-0.5 rounded-full">
                        ALLOW
                      </span>
                    )}
                    {row.decision === "redact" && (
                      <span className="inline-flex items-center gap-1 bg-amber-950/60 border border-amber-500/40 text-amber-300 font-bold text-[10px] uppercase px-2 py-0.5 rounded-full">
                        REDACT
                      </span>
                    )}
                    {row.decision === "block" && (
                      <span className="inline-flex items-center gap-1 bg-red-950/60 border border-red-500/40 text-red-300 font-bold text-[10px] uppercase px-2 py-0.5 rounded-full">
                        BLOCK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
