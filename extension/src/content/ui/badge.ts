/**
 * In-DOM Protection State Badge.
 *
 * Visually confirms to the user whether the adapter has successfully hooked
 * into the page's input elements.
 */

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

export function renderProtectionBadge(isActive: boolean): void {
  const root = ensureBadgeHost();

  const statusText = isActive
    ? "VeilGuard: protection active"
    : "VeilGuard: protection inactive (adapter self-test failed)";

  const dotColor = isActive ? "#22c55e" : "#ef4444";
  const borderColor = isActive ? "#15803d" : "#b91c1c";
  const textColor = isActive ? "#86efac" : "#fca5a5";

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
        color: ${textColor};
        border: 1px solid ${borderColor};
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
        user-select: none;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${dotColor};
      }
    </style>
    <div class="badge" id="veilguard-badge" role="status">
      <span class="dot"></span>
      <span class="text" id="veilguard-badge-text">${statusText}</span>
    </div>
  `;
}
