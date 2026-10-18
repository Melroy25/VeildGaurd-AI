/**
 * VeilGuard AI - Web Demo Showcase Application
 *
 * 100% Client-Side In-Browser Privacy Firewall Demonstration.
 * Built for Vercel deployment with zero external network dependencies.
 */

import React, { useState, useEffect } from "react";
import { Dashboard } from "./components/Dashboard";
import { Playground } from "./components/Playground";
import { BenchmarkExplorer } from "./components/BenchmarkExplorer";
import { ArchitectureGuide } from "./components/ArchitectureGuide";

type ActiveTab = "dashboard" | "playground" | "benchmark" | "architecture";

export const App: React.FC = () => {
  const getInitialTab = (): ActiveTab => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "dashboard" || tabParam === "playground" || tabParam === "benchmark" || tabParam === "architecture") {
        return tabParam;
      }
      if (window.location.hash === "#dashboard") return "dashboard";
      if (window.location.hash === "#benchmark") return "benchmark";
      if (window.location.hash === "#architecture") return "architecture";
    }
    return "dashboard"; // Default to Privacy Dashboard!
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>(getInitialTab);

  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === "#dashboard") setActiveTab("dashboard");
      else if (window.location.hash === "#playground") setActiveTab("playground");
      else if (window.location.hash === "#benchmark") setActiveTab("benchmark");
      else if (window.location.hash === "#architecture") setActiveTab("architecture");
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  return (
    <div className="min-h-screen bg-[#060b14] text-slate-100 font-sans relative overflow-x-hidden">
      {/* Ambient Blue Glass Glow Elements */}
      <div className="fixed -top-40 right-1/4 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[128px] pointer-events-none -z-0" />
      <div className="fixed top-1/2 -left-40 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none -z-0" />
      <div className="fixed -bottom-40 right-1/3 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[128px] pointer-events-none -z-0" />

      {/* Navigation Header */}
      <header className="border-b border-white/10 px-6 lg:px-12 py-4 bg-white/[0.02] backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.45)]">
              <svg className="w-5 h-5 text-slate-950 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  VeilGuard <span className="text-sky-400">AI</span>
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded-full">
                  LIVE DEMO
                </span>
              </div>
              <p className="text-xs text-slate-400">Context-Aware Privacy Firewall for AI Tools</p>
            </div>
          </div>

          {/* Frosted Glass Segmented Navigation */}
          <nav className="flex items-center gap-1.5 bg-white/[0.04] border border-white/10 rounded-xl p-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-gradient-to-r from-sky-500 to-sky-600 text-slate-950 font-bold shadow-[0_2px_12px_rgba(56,189,248,0.4)]"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              📊 Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("playground")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "playground"
                  ? "bg-gradient-to-r from-sky-500 to-sky-600 text-slate-950 font-bold shadow-[0_2px_12px_rgba(56,189,248,0.4)]"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              Playground
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("benchmark")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "benchmark"
                  ? "bg-gradient-to-r from-sky-500 to-sky-600 text-slate-950 font-bold shadow-[0_2px_12px_rgba(56,189,248,0.4)]"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              Benchmark Explorer
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("architecture")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "architecture"
                  ? "bg-gradient-to-r from-sky-500 to-sky-600 text-slate-950 font-bold shadow-[0_2px_12px_rgba(56,189,248,0.4)]"
                  : "text-slate-300 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              Architecture &amp; Rules
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 lg:px-12 py-8 relative z-10">
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "playground" && <Playground />}
        {activeTab === "benchmark" && <BenchmarkExplorer />}
        {activeTab === "architecture" && <ArchitectureGuide />}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 lg:px-12 py-6 bg-white/[0.01] backdrop-blur-md relative z-10 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>100% In-Browser Deterministic Processing &bull; Zero External Telemetry (Rule 8)</span>
          </div>
          <div>
            <span>VeilGuard AI &bull; Team Vexora &bull; DevHack 2026 PS 2.2</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
