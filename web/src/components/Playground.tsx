/**
 * VeilGuard Web Demo - Interactive Privacy Firewall Playground
 *
 * Provides real-time in-browser prompt interception, side-by-side diffing,
 * bracketed role pseudonymization, and copyable sanitized output.
 */

import React, { useState, useMemo } from "react";
import { sanitizeAndEvaluate, type ScanResult } from "../engine/sanitizer";

interface Preset {
  title: string;
  category: string;
  badge: string;
  badgeColor: string;
  prompt: string;
}

const PRESETS: Preset[] = [
  {
    title: "Healthcare Patient Note",
    category: "Medical & Govt ID",
    badge: "KYC / PII",
    badgeColor: "text-amber-400 border-amber-500/30 bg-amber-950/40",
    prompt: "Patient Rahul Sharma, phone 9876543210, and Aadhaar 2345 6789 0123, has diabetes. Please summarize the dietary precautions.",
  },
  {
    title: "Cloud Secret Exposure",
    category: "Critical Secret",
    badge: "BLOCKED",
    badgeColor: "text-rose-400 border-rose-500/30 bg-rose-950/40",
    prompt: "Here is my AWS configuration: AWS_ACCESS_KEY_ID = AKIAIOSFODNN7EXAMPLE and secret = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY. Why is it failing?",
  },
  {
    title: "Financial Customer Record",
    category: "Banking & PAN",
    badge: "REDACTED",
    badgeColor: "text-sky-400 border-sky-500/30 bg-sky-950/40",
    prompt: "Customer Priya Patel (email: priya.patel@example.com) with PAN ABCDE1234F deposited $50,000 yesterday.",
  },
  {
    title: "Benign Python Function",
    category: "Benign Code",
    badge: "ALLOWED",
    badgeColor: "text-emerald-400 border-emerald-500/30 bg-emerald-950/40",
    prompt: "def calculate_compound_interest(principal: float, rate: float, time_years: int) -> float:\n    return principal * ((1 + rate / 100) ** time_years)",
  },
];

export const Playground: React.FC = () => {
  const [prompt, setPrompt] = useState<string>(PRESETS[0].prompt);
  const [profile, setProfile] = useState<string>("corporate");
  const [copied, setCopied] = useState<boolean>(false);

  const scanResult: ScanResult = useMemo(() => {
    return sanitizeAndEvaluate(prompt, profile);
  }, [prompt, profile]);

  const handleCopy = () => {
    navigator.clipboard.writeText(scanResult.sanitizedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const decisionStyles = {
    allow: {
      label: "ALLOW",
      sub: "Safe to Submit",
      badge: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40",
      dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]",
    },
    redact: {
      label: "REDACT",
      sub: "Sanitized & Delivered",
      badge: "bg-amber-950/60 text-amber-300 border-amber-500/40",
      dot: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]",
    },
    require_approval: {
      label: "APPROVAL REQUIRED",
      sub: "Human Review Enforced",
      badge: "bg-sky-950/60 text-sky-300 border-sky-500/40",
      dot: "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]",
    },
    block: {
      label: "BLOCK",
      sub: "Submission Intercepted",
      badge: "bg-rose-950/60 text-rose-300 border-rose-500/40",
      dot: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]",
    },
  }[scanResult.decision];

  return (
    <div className="space-y-8">
      {/* Preset Buttons */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Select Sample Prompt Scenario:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESETS.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => setPrompt(p.prompt)}
              className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer backdrop-blur-md ${
                prompt === p.prompt
                  ? "bg-white/[0.08] border-sky-500/60 shadow-[0_0_15px_rgba(56,189,248,0.2)]"
                  : "bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white">{p.title}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${p.badgeColor}`}>
                  {p.badge}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2">{p.prompt}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Firewall Control Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Input Pane */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="prompt-input" className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              Original Prompt (User Input)
            </label>
            <span className="text-[11px] text-slate-400 font-mono">
              {prompt.length} chars
            </span>
          </div>
          <div className="relative">
            <textarea
              id="prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              placeholder="Paste customer conversations, code, or medical notes to test privacy interception..."
              className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-4 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/80 focus:ring-1 focus:ring-sky-500/50 backdrop-blur-md resize-none shadow-inner"
            />
          </div>
        </div>

        {/* Right Output Pane */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              Sanitized Prompt (Delivered to AI)
            </label>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs font-semibold px-3 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? "Copied ✓" : "Copy Sanitized"}
            </button>
          </div>
          <div className="relative bg-slate-950/80 border border-white/10 rounded-xl p-4 h-[184px] overflow-y-auto text-sm font-mono text-slate-100 backdrop-blur-md shadow-inner whitespace-pre-wrap word-break">
            {scanResult.decision === "block" ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <div className="w-10 h-10 rounded-full bg-rose-950/60 border border-rose-500/40 text-rose-400 flex items-center justify-center mb-2 font-bold text-lg">
                  ⛔
                </div>
                <span className="text-sm font-bold text-rose-300">SUBMISSION BLOCKED</span>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Critical secret or token detected. Nothing is transmitted to external endpoints.
                </p>
              </div>
            ) : (
              scanResult.sanitizedText
            )}
          </div>
        </div>
      </div>

      {/* Decision & Findings Status Strip */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5">
            <span className={`w-3 h-3 rounded-full ${decisionStyles.dot}`} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Firewall Decision:</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${decisionStyles.badge}`}>
                  {decisionStyles.label}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">{scanResult.reason}</p>
            </div>
          </div>

          <div className="flex items-center gap-6 self-end sm:self-auto">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Risk Score</span>
              <span className="text-lg font-mono font-bold text-white">
                {(scanResult.riskScore * 100).toFixed(0)}%
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Entities Intercepted</span>
              <span className="text-lg font-mono font-bold text-sky-400">
                {scanResult.findings.length}
              </span>
            </div>
          </div>
        </div>

        {/* Findings Chips */}
        {scanResult.findings.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Detected Entities:
            </span>
            <div className="flex flex-wrap gap-2">
              {scanResult.findings.map((f, i) => (
                <div
                  key={i}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs flex items-center gap-2 backdrop-blur-md"
                >
                  <span className="text-sky-400 font-semibold">{f.entity_type}</span>
                  <span className="text-slate-500 font-mono text-[11px]">&rarr;</span>
                  <span className="text-emerald-300 font-mono font-bold">{f.placeholder}</span>
                  <span className="text-[10px] text-slate-400">({(f.confidence * 100).toFixed(0)}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
