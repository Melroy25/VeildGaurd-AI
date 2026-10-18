/**
 * In-DOM Protection State Badge.
 *
 * Visually confirms to the user whether the adapter has successfully hooked
 * into the page's input elements, and reflects the current analysis state.
 */

export type BadgeState =
  | "active"
  | "limited"
  | "canary"
  | "engine_unreachable"
  | "error"
  | "inactive"
  | "analyzing"
  | "review";

let badgeHost: HTMLElement | null = null;
let badgeShadow: ShadowRoot | null = null;

function ensureBadgeHost(): ShadowRoot {
  if (!badgeHost) {
    badgeHost = document.createElement("div");
    badgeHost.id = "veilguard-badge-host";
    badgeHost.style.position = "fixed";
    badgeHost.style.zIndex = "2147483646";
    badgeHost.style.top = "12px";
    badgeHost.style.right = "12px";
    badgeHost.style.pointerEvents = "none";
    document.documentElement.appendChild(badgeHost);

    badgeShadow = badgeHost.attachShadow({ mode: "open" });
  }
  return badgeShadow!;
}

const STATE_CONFIG: Record<BadgeState, { dot: string; border: string; text: string; label: string }> = {
  active:             { dot: "#22c55e", border: "#15803d", text: "#86efac", label: "VeilGuard: protection active" },
  limited:            { dot: "#f59e0b", border: "#b45309", text: "#fcd34d", label: "Limited protection (site layout changed)" },
  canary:             { dot: "#f59e0b", border: "#b45309", text: "#fcd34d", label: "Backstop may not be working (canary)" },
  engine_unreachable: { dot: "#ef4444", border: "#b91c1c", text: "#fca5a5", label: "Engine not reachable, sending is blocked" },
  error:              { dot: "#ef4444", border: "#b91c1c", text: "#fca5a5", label: "Engine not reachable, sending is blocked" },
  inactive:           { dot: "#ef4444", border: "#b91c1c", text: "#fca5a5", label: "Inactive on this page (adapter self-test failed)" },
  analyzing:          { dot: "#f59e0b", border: "#b45309", text: "#fcd34d", label: "VeilGuard: analyzing…" },
  review:             { dot: "#38bdf8", border: "#0369a1", text: "#7dd3fc", label: "VeilGuard: review required" },
};

function renderBadge(state: BadgeState, customLabel?: string): void {
  const root = ensureBadgeHost();
  const cfg = STATE_CONFIG[state] ?? STATE_CONFIG.active;
  const displayLabel = customLabel || cfg.label;

  root.innerHTML = `
    <style>
      .badge {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.02em;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 5px 12px;
        border-radius: 9999px;
        background: rgba(10, 17, 32, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: ${cfg.text};
        border: 1px solid ${cfg.border};
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(56, 189, 248, 0.15);
        user-select: none;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${cfg.dot};
        box-shadow: 0 0 8px ${cfg.dot};
      }
      .analyzing .dot {
        animation: pulse 1s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.3; transform: scale(0.8); }
      }
    </style>
    <div class="badge ${state}" id="veilguard-badge" role="status" aria-live="polite">
      <span class="dot"></span>
      <span class="text" id="veilguard-badge-text">${displayLabel}</span>
    </div>
  `;
}

export function renderProtectionBadge(isActive: boolean, customLabel?: string): void {
  renderBadge(isActive ? "active" : "inactive", customLabel);
}

/**
 * Updates the badge to reflect the current analysis/flow state.
 * Called from flow.ts as the state machine transitions.
 */
export function updateBadgeState(state: BadgeState, customLabel?: string): void {
  renderBadge(state, customLabel);
}

