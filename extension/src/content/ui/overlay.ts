/**
 * In-DOM Shadow DOM Review/Blocked Overlay.
 *
 * Rendered in an open shadow root to prevent host-page CSS interference while
 * permitting test inspection.
 */

let overlayHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;

function ensureHost(): ShadowRoot {
  if (!overlayHost) {
    overlayHost = document.createElement("div");
    overlayHost.id = "veilguard-overlay-host";
    overlayHost.style.position = "fixed";
    overlayHost.style.zIndex = "2147483647";
    overlayHost.style.top = "0";
    overlayHost.style.left = "0";
    overlayHost.style.width = "100%";
    overlayHost.style.height = "100%";
    overlayHost.style.pointerEvents = "none";
    document.documentElement.appendChild(overlayHost);

    // Decision: mode "open" allows test inspection and automated assertions
    shadowRoot = overlayHost.attachShadow({ mode: "open" });
  }
  return shadowRoot!;
}

export function showBlockedOverlay(): void {
  const root = ensureHost();
  if (overlayHost) {
    overlayHost.style.pointerEvents = "auto";
  }

  root.innerHTML = `
    <style>
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .modal {
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid #dc2626;
        border-radius: 10px;
        padding: 24px;
        max-width: 440px;
        width: 90%;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      }
      .modal-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      .icon {
        width: 24px;
        height: 24px;
        background: #dc2626;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: white;
        font-size: 14px;
      }
      h2 {
        margin: 0;
        font-size: 1.15rem;
        color: #f87171;
      }
      p {
        margin: 0 0 20px 0;
        font-size: 0.92rem;
        line-height: 1.45;
        color: #cbd5e1;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
      }
      button {
        background: #334155;
        color: #f8fafc;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      button:hover {
        background: #475569;
      }
    </style>
    <div class="backdrop" id="veilguard-modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="veilguard-title">
        <div class="modal-header">
          <div class="icon">!</div>
          <h2 id="veilguard-title">Blocked by VeilGuard</h2>
        </div>
        <p id="veilguard-message">Sensitive content was detected. The message was not sent.</p>
        <div class="actions">
          <button type="button" id="veilguard-dismiss-btn">Dismiss</button>
        </div>
      </div>
    </div>
  `;

  const dismissBtn = root.getElementById("veilguard-dismiss-btn");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      hideBlockedOverlay();
    });
  }
}

export function hideBlockedOverlay(): void {
  if (shadowRoot) {
    shadowRoot.innerHTML = "";
  }
  if (overlayHost) {
    overlayHost.style.pointerEvents = "none";
  }
}
