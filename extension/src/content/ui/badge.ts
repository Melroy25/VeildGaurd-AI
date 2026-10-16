/**
 * In-DOM Protection State Badge.
 *
 * Visually confirms to the user whether the adapter has successfully hooked
 * into the page's input elements, and reflects the current analysis state.
 */

type BadgeState = "active" | "analyzing" | "review" | "error" | "inactive";

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
  active:    { dot: "#22c55e", border: "#15803d", text: "#86efac", label: "VeilGuard: protection active" },
  analyzing: { dot: "#f59e0b", border: "#b45309", text: "#fcd34d", label: "VeilGuard: analyzing…" },
  review:    { dot: "#38bdf8", border: "#0369a1", text: "#7dd3fc", label: "VeilGuard: review required" },
  error:     { dot: "#ef4444", border: "#b91c1c", text: "#fca5a5", label: "VeilGuard: engine unreachable" },
  inactive:  { dot: "#ef4444", border: "#b91c1c", text: "#fca5a5", label: "VeilGuard: protection inactive" },
};

function renderBadge(state: BadgeState): void {
  const root = ensureBadgeHost();
  const cfg = STATE_CONFIG[state];

  root.innerHTML = `
    <style>
      .badge {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 9999px;
        background: #0f172a;
        color: ${cfg.text};
        border: 1px solid ${cfg.border};
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
        user-select: none;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${cfg.dot};
      }
      .analyzing .dot {
        animation: pulse 1s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    </style>
    <div class="badge ${state}" id="veilguard-badge" role="status" aria-live="polite">
      <span class="dot"></span>
      <span class="text" id="veilguard-badge-text">${cfg.label}</span>
    </div>
  `;
}

export function renderProtectionBadge(isActive: boolean): void {
  renderBadge(isActive ? "active" : "inactive");
}

/**
 * Updates the badge to reflect the current analysis/flow state.
 * Called from flow.ts as the state machine transitions.
 */
export function updateBadgeState(state: BadgeState): void {
  renderBadge(state);
}
