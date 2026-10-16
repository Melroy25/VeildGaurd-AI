import React, { useState, useEffect, useCallback } from "react";

/**
 * VeilGuard AI Options Page
 *
 * Provides:
 *  - Token password field (stored in chrome.storage.local, never echoed to DOM via innerHTML)
 *  - Policy profile dropdown (loaded from engine via FETCH_PROFILES message)
 *  - "Test Connection" button (PING → engine)
 *  - "Clear Vault" button (VAULT_CLEAR for all tabs)
 *  - Audit log summary display
 *
 * Rule 7: This page never displays or logs raw prompt text. Only metadata is shown.
 */

type ConnectionStatus = "idle" | "checking" | "ok" | "error";

interface ProfilesMsg {
  ok: boolean;
  profiles?: string[];
  errorMessage?: string;
}

interface PingMsg {
  ok: boolean;
  health?: { status: string; version?: string };
  errorMessage?: string;
  errorKind?: string;
}

export const Options: React.FC = () => {
  const [token, setToken] = useState<string>("");
  const [savedToken, setSavedToken] = useState<string>("");
  const [profile, setProfile] = useState<string>("company");
  const [profiles, setProfiles] = useState<string[]>(["company"]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("idle");
  const [connDetail, setConnDetail] = useState<string>("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [vaultCleared, setVaultCleared] = useState(false);

  // On mount: load stored token and profile preference
  useEffect(() => {
    chrome.storage.local.get(["vg_token", "vg_profile"], (result) => {
      const t = typeof result["vg_token"] === "string" ? (result["vg_token"] as string) : "";
      const p = typeof result["vg_profile"] === "string" ? (result["vg_profile"] as string) : "company";
      setSavedToken(t);
      setToken(t);
      setProfile(p);
    });
  }, []);

  // Load profiles from engine
  const loadProfiles = useCallback(() => {
    setProfilesLoading(true);
    chrome.runtime.sendMessage({ type: "FETCH_PROFILES" }, (response: ProfilesMsg) => {
      setProfilesLoading(false);
      if (chrome.runtime.lastError) {
        return;
      }
      if (response?.ok && Array.isArray(response.profiles) && response.profiles.length > 0) {
        setProfiles(response.profiles);
      }
    });
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleSaveToken = () => {
    const trimmed = token.trim();
    chrome.storage.local.set({ vg_token: trimmed }, () => {
      setSavedToken(trimmed);
      setTokenSaved(true);
      setTimeout(() => setTokenSaved(false), 2500);
      // Reload profiles after token update
      loadProfiles();
    });
  };

  const handleSaveProfile = (newProfile: string) => {
    setProfile(newProfile);
    chrome.storage.local.set({ vg_profile: newProfile });
  };

  const handleTestConnection = () => {
    setConnStatus("checking");
    setConnDetail("");
    chrome.runtime.sendMessage({ type: "PING" }, (response: PingMsg) => {
      if (chrome.runtime.lastError) {
        setConnStatus("error");
        setConnDetail(chrome.runtime.lastError.message ?? "Extension error");
        return;
      }
      if (response?.ok) {
        setConnStatus("ok");
        const v = response.health?.version ? ` v${response.health.version}` : "";
        setConnDetail(`Engine online${v}`);
      } else {
        setConnStatus("error");
        const kind = response?.errorKind ?? "unknown";
        const msg = response?.errorMessage ?? "Unknown error";
        setConnDetail(kind === "auth_error" ? "Token rejected (401) — check your token." : msg);
      }
    });
  };

  const handleClearVault = () => {
    // Query all tabs and clear vault for each
    chrome.tabs.query({}, (tabs) => {
      const promises = tabs
        .filter((t) => t.id != null)
        .map((t) => new Promise<void>((resolve) => {
          chrome.runtime.sendMessage({ type: "VAULT_CLEAR", tabId: t.id! }, () => resolve());
        }));
      Promise.all(promises).then(() => {
        setVaultCleared(true);
        setTimeout(() => setVaultCleared(false), 2500);
      });
    });
  };

  const statusColor: Record<ConnectionStatus, string> = {
    idle: "bg-slate-500",
    checking: "bg-amber-400 animate-pulse",
    ok: "bg-emerald-400",
    error: "bg-red-500",
  };
  const statusLabel: Record<ConnectionStatus, string> = {
    idle: "Not tested",
    checking: "Checking…",
    ok: "Connected",
    error: "Error",
  };

  const tokenMasked = savedToken.length > 0
    ? `${savedToken.substring(0, 4)}${"•".repeat(Math.min(savedToken.length - 4, 20))}`
    : "(none)";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-8">
      <header className="max-w-4xl mx-auto border-b border-slate-800 pb-4 mb-8">
        <h1 className="text-2xl font-bold text-sky-400">VeilGuard AI — Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Privacy firewall configuration. Token is stored locally and never transmitted outside
          <code className="text-xs bg-slate-800 px-1 rounded ml-1">127.0.0.1:8765</code>.
        </p>
      </header>

      <main className="max-w-4xl mx-auto space-y-6">

        {/* Engine Connectivity */}
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Engine Connectivity</h2>
          <div className="flex items-center gap-3 mb-4">
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${statusColor[connStatus]}`} />
            <span className="text-sm text-slate-300">
              {statusLabel[connStatus]}
              {connDetail && (
                <span className={`ml-2 text-xs ${connStatus === "error" ? "text-red-400" : "text-emerald-400"}`}>
                  — {connDetail}
                </span>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Target: <code>http://127.0.0.1:8765/health</code> — must be running for protection to be active.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={connStatus === "checking"}
              className="px-4 py-2 rounded-md bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-sm font-semibold transition-colors"
            >
              {connStatus === "checking" ? "Testing…" : "Test Connection"}
            </button>
          </div>
        </section>

        {/* Token Configuration */}
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-1">Bearer Token</h2>
          <p className="text-xs text-slate-500 mb-4">
            Found in <code>.veilguard/token</code> in the engine directory. Never share or commit this value.
          </p>
          {savedToken.length > 0 && (
            <p className="text-xs text-slate-400 mb-3">
              Stored token: <code className="font-mono">{tokenMasked}</code>
            </p>
          )}
          <div className="flex gap-3 items-center">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your VeilGuard bearer token"
              autoComplete="new-password"
              className="flex-1 px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm font-mono focus:border-sky-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveToken}
              className="px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 text-sm font-semibold transition-colors"
            >
              {tokenSaved ? "Saved ✓" : "Save Token"}
            </button>
          </div>
        </section>

        {/* Policy Profile */}
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-1">Policy Profile</h2>
          <p className="text-xs text-slate-500 mb-4">
            Controls which ruleset is applied to analyzed submissions.
          </p>
          <div className="flex gap-3 items-center">
            <select
              value={profile}
              onChange={(e) => handleSaveProfile(e.target.value)}
              disabled={profilesLoading}
              className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-sky-500 focus:outline-none"
            >
              {profiles.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadProfiles}
              disabled={profilesLoading}
              className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 transition-colors"
            >
              {profilesLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </section>

        {/* Session Vault */}
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-1">Session Vault</h2>
          <p className="text-sm text-slate-400 mb-4">
            The session vault stores pseudonymization placeholder mappings (e.g.{" "}
            <code className="text-xs bg-slate-800 px-1 rounded">PERSON → [PERSON_1]</code>) to keep
            replacements consistent across conversation turns. It holds{" "}
            <strong>entity type and placeholder only</strong> — no raw message content.
            The vault is automatically cleared when browser tabs are closed.
          </p>
          <button
            type="button"
            onClick={handleClearVault}
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm font-semibold transition-colors"
          >
            {vaultCleared ? "Vault Cleared ✓" : "Clear All Vaults"}
          </button>
        </section>

        {/* Privacy Notice */}
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-2">Privacy &amp; Audit Log</h2>
          <p className="text-sm text-slate-400">
            Per Security Rule 7, only metadata is recorded in the audit log: timestamps, risk
            classification categories, entity counts, rule IDs, and policy decisions.
            <strong className="text-amber-400"> Raw prompt content is never stored</strong>.
          </p>
          <p className="text-xs text-slate-500 mt-3">
            Audit log entries are viewable in the VeilGuard popup. Zero external telemetry: no
            network requests carrying user content leave the local boundary (Rule 8).
          </p>
        </section>

      </main>
    </div>
  );
};
