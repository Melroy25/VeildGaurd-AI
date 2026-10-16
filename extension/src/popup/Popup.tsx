import React from "react";

export const Popup: React.FC = () => {
  return (
    <div className="w-80 p-4 font-sans bg-slate-900 text-slate-100 min-h-[220px] flex flex-col justify-between">
      <header className="border-b border-slate-700 pb-2">
        <h1 className="text-base font-bold text-sky-400">VeilGuard AI</h1>
        <p className="text-xs text-slate-400">Phase 0 scaffold</p>
      </header>

      <main className="my-4">
        <div className="bg-amber-950/40 border border-amber-600/50 rounded-lg p-3 text-center">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mr-2"></span>
          <span className="text-sm font-semibold text-amber-200">
            Protection inactive
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-3 text-center">
          No privacy filtering or content interception is active in Phase 0.
        </p>
      </main>

      <footer className="pt-2 border-t border-slate-800 text-[11px] text-slate-500 flex justify-between">
        <span>v0.0.1 (Scaffold)</span>
        <button
          onClick={() => chrome.runtime.openOptionsPage?.()}
          className="text-sky-400 hover:underline cursor-pointer"
        >
          Open Dashboard
        </button>
      </footer>
    </div>
  );
};
