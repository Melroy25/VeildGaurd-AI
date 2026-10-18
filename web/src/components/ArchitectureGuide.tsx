/**
 * VeilGuard Web Demo - Architecture & Privacy Invariants Guide
 */

import React from "react";

export const ArchitectureGuide: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* 5-Step Core Flow */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-xl space-y-6">
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-sky-400 bg-sky-950/60 border border-sky-500/30 px-3 py-1 rounded-full inline-block">
            System Design
          </span>
          <h3 className="text-xl font-bold text-white tracking-tight mt-2">
            The 5-Line Core Protection Flow
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            How VeilGuard AI operates between the user and AI endpoints:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
            <span className="w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-400 font-bold text-xs flex items-center justify-center">
              1
            </span>
            <h4 className="text-sm font-semibold text-white">Intercept</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              DOM submission is captured on Enter or Send click before any network request is created.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
            <span className="w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-400 font-bold text-xs flex items-center justify-center">
              2
            </span>
            <h4 className="text-sm font-semibold text-white">Analyze Locally</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Local engine infers task necessity, validates checksums, and calculates re-ID risk in &lt;40ms.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
            <span className="w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-400 font-bold text-xs flex items-center justify-center">
              3
            </span>
            <h4 className="text-sm font-semibold text-white">Decide</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Declarative YAML policies determine action: allow, redact, require approval, or block.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
            <span className="w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-400 font-bold text-xs flex items-center justify-center">
              4
            </span>
            <h4 className="text-sm font-semibold text-white">Pseudonymize</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sensitive attributes replaced with utility-preserving placeholders (<code className="text-sky-300">[CUSTOMER_1]</code>, <code className="text-sky-300">****-1234</code>).
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
            <span className="w-6 h-6 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-400 font-bold text-xs flex items-center justify-center">
              5
            </span>
            <h4 className="text-sm font-semibold text-white">Enforce &amp; Log</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              User reviews diff in Shadow DOM; fetch backstop delivers safe prompt while metadata is logged.
            </p>
          </div>
        </div>
      </div>

      {/* Security & Privacy Invariants */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-xl space-y-4">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Core Privacy Invariants &amp; Engineering Rules
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Mandatory constraints enforced across every layer of the codebase:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
              Fail Closed (Rule 6)
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              If the engine is unreachable or returns errors, submission is blocked immediately. Uninspected data never leaks silently.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
              Zero Raw Content Persistence (Rule 7)
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              Raw prompts, documents, and chat messages are never written to disk, telemetry, or storage. Audit logs store metadata only.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
              Strict Loopback Binding (Rule 5)
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              The local Python engine binds strictly to <code className="text-sky-300">127.0.0.1</code>, never <code className="text-rose-400">0.0.0.0</code>.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
              Zero Keylogging &amp; Opt-In (Rule 6)
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              Zero keyboard hooks (<code className="text-slate-400">SetWindowsHookEx</code>, <code className="text-slate-400">pynput</code>). Clipboard checks are opt-in and active only when AI tools are focused.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
