/**
 * VeilGuard AI - Onboarding Welcome UI
 *
 * Interactive blue glass onboarding guide displayed upon extension installation.
 * Educates users on extension pinning, local engine connectivity,
 * privacy firewall mechanics, and provides one-click testbed access.
 */

import React, { useState, useEffect } from "react";

interface EngineHealth {
  ok: boolean;
  version?: string;
  error?: string;
}

export const Onboarding: React.FC = () => {
  const [engineHealth, setEngineHealth] = useState<EngineHealth | null>(null);
  const [checking, setChecking] = useState<boolean>(true);

  const checkEngine = () => {
    setChecking(true);
    chrome.runtime.sendMessage({ type: "PING" }, (res) => {
      setChecking(false);
      if (chrome.runtime.lastError || !res?.ok) {
        setEngineHealth({ ok: false, error: res?.errorMessage ?? "Engine unreachable" });
      } else {
        setEngineHealth({ ok: true, version: res.health?.version ?? "0.1.0" });
      }
    });
  };

  useEffect(() => {
    checkEngine();
  }, []);

  return (
    <div className="min-h-screen bg-[#060b14] text-slate-100 font-sans p-6 md:p-12 relative overflow-hidden selection:bg-sky-500/30 selection:text-white">
      {/* Ambient Blue Glass Glow Orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/10">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.45)]">
              <svg className="w-5 h-5 text-slate-950 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                VeilGuard <span className="text-sky-400">AI</span>
              </h1>
              <p className="text-xs text-slate-400">Context-Aware Privacy Firewall for AI Tools</p>
            </div>
          </div>

          {/* Engine Status Pill */}
          <div className="flex items-center gap-3 bg-white/[0.04] border border-white/10 px-4 py-2 rounded-xl backdrop-blur-md">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                checking
                  ? "bg-amber-400 animate-pulse"
                  : engineHealth?.ok
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                  : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]"
              }`}
            />
            <span className="text-xs font-medium text-slate-200">
              {checking
                ? "Checking engine…"
                : engineHealth?.ok
                ? `Engine Connected (v${engineHealth.version})`
                : "Engine Unreachable"}
            </span>
            <button
              type="button"
              onClick={checkEngine}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium ml-1 transition-colors cursor-pointer"
            >
              Re-test
            </button>
          </div>
        </header>

        {/* Welcome Hero */}
        <section className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl relative">
          <div className="max-w-2xl space-y-3">
            <span className="text-xs font-semibold tracking-wider uppercase text-sky-400 bg-sky-950/60 border border-sky-500/30 px-3 py-1 rounded-full inline-block">
              Welcome to Next-Gen AI Privacy
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-snug">
              Protect your personal and company data before it reaches AI servers.
            </h2>
            <p className="text-sm md:text-base text-slate-300 leading-relaxed">
              VeilGuard AI intercepts prompts in the browser, evaluates risk locally on your machine,
              pseudonymizes sensitive names and identifiers while preserving task context, and ensures zero raw prompt persistence.
            </p>
          </div>
        </section>

        {/* 4 Interactive Feature Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Step 1 */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 backdrop-blur-md hover:border-sky-500/30 transition-all space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-base font-semibold text-white">Pin VeilGuard in Chrome</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Click the Chrome puzzle icon (<span className="text-sky-400">Extensions</span>) in the top right of your browser,
              then click the pin icon next to VeilGuard AI to see real-time protection badges and popup metrics on every AI page.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 backdrop-blur-md hover:border-sky-500/30 transition-all space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-bold flex items-center justify-center">
                2
              </span>
              <h3 className="text-base font-semibold text-white">Local Loopback Engine</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              VeilGuard relies strictly on a local Python engine at <code className="text-sky-300 bg-sky-950/60 px-1.5 py-0.5 rounded text-[11px]">127.0.0.1:8765</code>.
              Your prompts never leave your device for scanning, and raw text is never saved to disk.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 backdrop-blur-md hover:border-sky-500/30 transition-all space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-bold flex items-center justify-center">
                3
              </span>
              <h3 className="text-base font-semibold text-white">Pre-Submission Shadow Review</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              When sensitive data (such as Aadhaar, PAN, phone numbers, or passwords) is detected, an isolated Shadow DOM overlay lets you
              review the side-by-side diff before anything is submitted.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 backdrop-blur-md hover:border-sky-500/30 transition-all space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-bold flex items-center justify-center">
                4
              </span>
              <h3 className="text-base font-semibold text-white">Metadata-Only Audit Dashboard</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Monitor protection counts, risk distributions, and policy enforcement trends without compromising privacy.
              All logs strictly record metadata—never user prompt content.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <footer className="flex flex-wrap items-center justify-between gap-4 pt-4">
          <div className="flex items-center gap-3">
            <a
              href="http://127.0.0.1:4310/"
              target="_blank"
              rel="noreferrer"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-slate-950 text-sm font-bold shadow-[0_2px_14px_rgba(56,189,248,0.4)] transition-all cursor-pointer flex items-center gap-2"
            >
              <span>Launch Mock AI Testbed</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
            <button
              type="button"
              onClick={() => chrome.runtime.openOptionsPage?.()}
              className="px-5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 text-white text-sm font-semibold transition-all cursor-pointer"
            >
              Open Privacy Dashboard
            </button>
          </div>

          <span className="text-xs text-slate-500">
            VeilGuard AI &bull; Team Vexora &bull; DevHack 2026
          </span>
        </footer>
      </div>
    </div>
  );
};
