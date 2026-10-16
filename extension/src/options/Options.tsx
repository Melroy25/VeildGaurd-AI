import React from "react";

export const Options: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-8">
      <header className="max-w-4xl mx-auto border-b border-slate-800 pb-4 mb-8">
        <h1 className="text-2xl font-bold text-sky-400">VeilGuard AI Dashboard</h1>
        <p className="text-sm text-slate-400">
          Privacy firewall audit and metadata monitor (Phase 0 scaffold)
        </p>
      </header>

      <main className="max-w-4xl mx-auto space-y-6">
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-2">Engine Connectivity</h2>
          <div className="flex items-center space-x-3 text-sm">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            <span className="text-slate-300">
              Engine status: <strong>Scaffold / Unlinked (Phase 0)</strong>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Target local engine endpoint: <code>http://127.0.0.1:8765/health</code>
          </p>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-2">Metadata Audit Log</h2>
          <p className="text-sm text-slate-400">
            Per Security Rule 7, only metadata (timestamps, risk classifications, rule IDs) is recorded.
            Raw prompt content is never logged.
          </p>
          <div className="mt-4 p-4 bg-slate-950 rounded border border-slate-800/80 text-xs text-slate-500 italic text-center">
            No audit events recorded yet. Privacy firewall is inactive in Phase 0.
          </div>
        </section>
      </main>
    </div>
  );
};
