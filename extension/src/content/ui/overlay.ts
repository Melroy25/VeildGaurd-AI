/**
 * VeilGuard AI - Shadow DOM Review Overlay
 *
 * Renders in an isolated Shadow DOM to prevent host-page CSS interference.
 * Provides three overlay modes:
 *  1. showReviewOverlay  - Diff comparison for require_approval/block decisions.
 *  2. showEngineErrorOverlay - Fail-closed notice when engine is unreachable.
 *  3. hideOverlay - Tears down the overlay.
 *
 * Security invariants:
 *  - All text is set via textContent / createTextNode — NEVER innerHTML with
 *    user-controlled content (Rule 7 — prevents XSS via prompt text).
 *  - Focus is trapped inside the modal when open (accessibility + prevents
 *    accidental submission while overlay is visible).
 *  - Escape key and "Edit" button both dismiss the overlay (user can revise).
 *  - Synthetic/programmatic clicks (isTrusted === false) on the Send Sanitized
 *    button are ignored to prevent automated bypass.
 */

import type { EngineAnalyzeResponse, EngineFinding, EngineContextBlock } from "../../shared/messages";

let overlayHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let focusTrapCleanup: (() => void) | null = null;
let escapeCleanup: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Shadow DOM host lifecycle
// ---------------------------------------------------------------------------

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

    // mode:"open" allows test inspection and automated assertions (Decision 4)
    shadowRoot = overlayHost.attachShadow({ mode: "open" });
  }
  return shadowRoot!;
}

function clearOverlay(): void {
  if (focusTrapCleanup) { focusTrapCleanup(); focusTrapCleanup = null; }
  if (escapeCleanup) { escapeCleanup(); escapeCleanup = null; }
  if (shadowRoot) { shadowRoot.innerHTML = ""; }
  if (overlayHost) { overlayHost.style.pointerEvents = "none"; }
}

export function hideOverlay(): void {
  clearOverlay();
}

// ---------------------------------------------------------------------------
// Shared style block
// ---------------------------------------------------------------------------

function buildStyleEl(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    .backdrop {
      position: fixed; inset: 0;
      background: rgba(6, 11, 20, 0.78);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .modal {
      background: rgba(10, 17, 32, 0.90);
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 16px; padding: 28px;
      max-width: 580px; width: 94%;
      box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(56, 189, 248, 0.12);
      display: flex; flex-direction: column; gap: 16px;
      max-height: 92vh; overflow-y: auto;
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
    }
    .modal-header { display: flex; align-items: center; gap: 12px; }
    .icon {
      width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: bold; color: #fff; font-size: 14px; flex-shrink: 0;
    }
    .icon-warn { background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); box-shadow: 0 0 14px rgba(239, 68, 68, 0.4); }
    .icon-info { background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%); box-shadow: 0 0 14px rgba(56, 189, 248, 0.4); }
    .icon-err  { background: linear-gradient(135deg, #f97316 0%, #c2410c 100%); box-shadow: 0 0 14px rgba(249, 115, 22, 0.4); }
    h2 { margin: 0; font-size: 1.15rem; font-weight: 700; letter-spacing: -0.01em; }
    .title-warn { color: #fca5a5; }
    .title-info { color: #38bdf8; }
    .title-err  { color: #fdba74; }
    p { margin: 0; font-size: 0.92rem; line-height: 1.55; color: #cbd5e1; }
    .section-label {
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 5px;
    }
    .diff-box {
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 14px; font-size: 0.86rem; line-height: 1.6;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      white-space: pre-wrap; word-break: break-word;
      max-height: 160px; overflow-y: auto; color: #e2e8f0;
      backdrop-filter: blur(8px);
    }
    .diff-removed { background: rgba(244, 63, 94, 0.28); color: #fecdd3; border-radius: 4px; padding: 2px 5px; border-bottom: 1px solid rgba(244, 63, 94, 0.5); }
    .diff-added   { background: rgba(16, 185, 129, 0.24); color: #a7f3d0; border-radius: 4px; padding: 2px 5px; border-bottom: 1px solid rgba(16, 185, 129, 0.5); }
    .utility-notice {
      font-size: 0.8rem; color: #94a3b8; padding: 10px 14px;
      background: rgba(15, 23, 42, 0.65);
      border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08);
      border-left: 3px solid #38bdf8;
    }
    .actions {
      display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;
      padding-top: 6px;
    }
    button {
      padding: 10px 18px; border-radius: 8px; border: none;
      font-size: 0.88rem; font-weight: 600; cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); line-height: 1;
    }
    .btn-edit {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #f8fafc;
      backdrop-filter: blur(8px);
    }
    .btn-edit:hover { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.25); }
    .btn-cancel {
      background: rgba(15, 23, 42, 0.6);
      color: #94a3b8;
      border: 1px solid rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(8px);
    }
    .btn-cancel:hover { background: rgba(255, 255, 255, 0.1); color: #f8fafc; border-color: rgba(255, 255, 255, 0.2); }
    .btn-send-original {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      color: #fff;
      box-shadow: 0 2px 10px rgba(220, 38, 38, 0.35);
    }
    .btn-send-original:hover { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); box-shadow: 0 4px 16px rgba(239, 68, 68, 0.45); }
    .btn-send {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: #fff;
      box-shadow: 0 2px 12px rgba(2, 132, 199, 0.35);
    }
    .btn-send:hover {
      background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%);
      border-color: #38bdf8;
      box-shadow: 0 4px 20px rgba(56, 189, 248, 0.45);
    }
    .btn-send:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-dismiss {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #f8fafc;
    }
    .btn-dismiss:hover { background: rgba(255, 255, 255, 0.15); }
    .findings-list {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;
    }
    .finding-chip {
      font-size: 0.75rem; padding: 3px 10px; border-radius: 9999px;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: #38bdf8;
      backdrop-filter: blur(6px);
    }
  `;
  return style;
}

// ---------------------------------------------------------------------------
// Focus trap
// ---------------------------------------------------------------------------

function trapFocus(modal: HTMLElement, root: ShadowRoot): () => void {
  const getFocusable = (): HTMLElement[] =>
    Array.from(modal.querySelectorAll<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    ));

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const focusable = getFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = root.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first) { e.preventDefault(); last.focus(); }
    } else {
      if (active === last) { e.preventDefault(); first.focus(); }
    }
  };

  // Attach to document since shadow DOM events bubble out
  document.addEventListener("keydown", handleKeydown, true);

  // Focus the first focusable element
  const focusable = getFocusable();
  if (focusable.length > 0) { focusable[0].focus(); }

  return () => document.removeEventListener("keydown", handleKeydown, true);
}

// ---------------------------------------------------------------------------
// Escape handler
// ---------------------------------------------------------------------------

function attachEscapeHandler(onEsc: () => void): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onEsc(); }
  };
  document.addEventListener("keydown", handler, true);
  return () => document.removeEventListener("keydown", handler, true);
}

// ---------------------------------------------------------------------------
// Diff rendering (safe textContent — no innerHTML with user text)
// ---------------------------------------------------------------------------

/**
 * Renders a diff between original and sanitized text by highlighting
 * each finding's span as "removed" in the original and the placeholder
 * as "added" in the sanitized version.
 *
 * IMPORTANT: All text is set via textContent to prevent XSS.
 * UTF-16 offsets from the engine are used directly (Decision 14).
 */
function buildDiffBox(text: string, findings: EngineFinding[]): HTMLDivElement {
  const box = document.createElement("div");
  box.id = "vg-original-text";
  box.className = "diff-box";
  box.setAttribute("aria-label", "Original text with sensitive content highlighted");

  // Sort findings by start offset for sequential rendering
  const sorted = [...findings]
    .filter((f) => f.action !== "keep")
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const finding of sorted) {
    if (finding.start < cursor) continue; // skip overlapping (already handled)

    // Text before this finding
    if (finding.start > cursor) {
      const before = document.createTextNode(text.slice(cursor, finding.start));
      box.appendChild(before);
    }

    // Highlighted "removed" span for the sensitive value
    const removed = document.createElement("span");
    removed.className = "diff-removed";
    removed.setAttribute("title", `${finding.entity_type} (${finding.action})`);
    removed.textContent = text.slice(finding.start, finding.end); // safe textContent
    box.appendChild(removed);

    cursor = finding.end;
  }

  // Remaining text after last finding
  if (cursor < text.length) {
    box.appendChild(document.createTextNode(text.slice(cursor)));
  }

  return box;
}

function buildSanitizedBox(sanitizedText: string, findings: EngineFinding[]): HTMLDivElement {
  const box = document.createElement("div");
  box.id = "vg-sanitized-text";
  box.className = "diff-box";
  box.setAttribute("aria-label", "Sanitized text with replacements highlighted");

  // Highlight placeholders in sanitized text
  // Placeholder patterns: [ENTITY_TYPE_N] or [SECRET_REMOVED]
  const PLACEHOLDER_RE = /\[([A-Z_]+(?:_\d+)?)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = PLACEHOLDER_RE.exec(sanitizedText)) !== null) {
    if (match.index > last) {
      box.appendChild(document.createTextNode(sanitizedText.slice(last, match.index)));
    }
    const added = document.createElement("span");
    added.className = "diff-added";

    // Find the corresponding finding to show action as tooltip
    const placeholder = match[0];
    const relatedFinding = findings.find((f) => f.placeholder === placeholder);
    if (relatedFinding) {
      added.setAttribute("title", `${relatedFinding.entity_type}: ${relatedFinding.action}`);
    }
    added.textContent = placeholder;
    box.appendChild(added);
    last = match.index + match[0].length;
  }

  if (last < sanitizedText.length) {
    box.appendChild(document.createTextNode(sanitizedText.slice(last)));
  }

  return box;
}

function buildWhySection(context?: EngineContextBlock): HTMLDivElement | null {
  if (!context) return null;

  const section = document.createElement("div");
  section.id = "vg-overlay-why";
  section.className = "why-section";
  section.style.cssText =
    "background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-size: 0.82rem; color: #cbd5e1; display: flex; flex-direction: column; gap: 8px;";

  const header = document.createElement("div");
  header.className = "section-label";
  header.style.cssText =
    "font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #38bdf8;";
  header.textContent = "Context Intelligence (Why)";
  section.appendChild(header);

  // 1. Task profile
  if (context.task) {
    const taskEl = document.createElement("div");
    taskEl.id = "vg-why-task";
    taskEl.textContent = `Task: ${context.task.type} (${context.task.confidence} confidence)`;
    section.appendChild(taskEl);
  }

  // 2. Detail necessity: unnecessary vs kept
  if (context.necessity && context.necessity.length > 0) {
    const unnecessaryCount = context.necessity.filter((n) => n.level === "unnecessary").length;
    const requiredCount = context.necessity.filter((n) => n.level === "required").length;
    const optionalCount = context.necessity.filter((n) => n.level === "optional").length;

    const necEl = document.createElement("div");
    necEl.id = "vg-why-necessity";
    const parts: string[] = [];
    if (unnecessaryCount > 0) parts.push(`${unnecessaryCount} unnecessary (redacted)`);
    if (requiredCount > 0) parts.push(`${requiredCount} required (kept)`);
    if (optionalCount > 0) parts.push(`${optionalCount} optional`);
    necEl.textContent = `Detail necessity: ${parts.join(", ")}`;
    section.appendChild(necEl);
  }

  // 3. Trade-offs
  if (context.tradeoffs && context.tradeoffs.length > 0) {
    const toEl = document.createElement("div");
    toEl.id = "vg-why-tradeoffs";
    toEl.style.cssText = "color: #fdba74;";
    for (const to of context.tradeoffs) {
      const line = document.createElement("div");
      line.textContent = `⚠ Trade-off: ${to.tradeoff || to.category || "Task needs detail"}`;
      toEl.appendChild(line);
    }
    section.appendChild(toEl);
  }

  // 4. Re-identification risk & contributors
  if (context.reidentification) {
    const reid = context.reidentification;
    const reidEl = document.createElement("div");
    reidEl.id = "vg-why-reid";

    const scoreLine = document.createElement("div");
    const pctBefore = (reid.score_before * 100).toFixed(0);
    const pctAfter = (reid.score_after * 100).toFixed(0);
    scoreLine.textContent = `Re-ID risk: ${reid.level_before} (${pctBefore}%) → ${reid.level_after} (${pctAfter}%)`;
    reidEl.appendChild(scoreLine);

    if (reid.contributors && reid.contributors.length > 0) {
      const contribLine = document.createElement("div");
      contribLine.id = "vg-why-reid-contributors";
      contribLine.style.cssText = "font-size: 0.78rem; color: #94a3b8; margin-top: 2px;";
      const contribs = reid.contributors
        .map((c) => `${c.type} (${(c.weight * 100).toFixed(0)}%)`)
        .join(", ");
      contribLine.textContent = `Contributors: ${contribs}`;
      reidEl.appendChild(contribLine);
    }

    section.appendChild(reidEl);
  }

  return section;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ReviewOverlayOptions {
  engineResult: EngineAnalyzeResponse;
  originalText: string;
  isBlockDecision: boolean;
  onSendSanitized: () => void;
  onSendOriginalConfirmed?: () => void;
  onEdit: () => void;
  onCancel?: () => void;
}

/**
 * Shows the review overlay with a diff of original vs. sanitized text.
 * For "block" decisions, the "Send Sanitized" button is disabled — the
 * user can only edit the original prompt (fail-closed for block policy).
 */
export function showReviewOverlay(opts: ReviewOverlayOptions): void {
  const root = ensureHost();
  clearOverlay();
  if (overlayHost) overlayHost.style.pointerEvents = "auto";

  const { engineResult, originalText, isBlockDecision, onSendSanitized, onEdit } = opts;

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "vg-overlay-title");

  // ---- Header ----
  const header = document.createElement("div");
  header.className = "modal-header";

  const icon = document.createElement("div");
  icon.className = `icon ${isBlockDecision ? "icon-warn" : "icon-info"}`;
  icon.textContent = isBlockDecision ? "✕" : "!";

  const title = document.createElement("h2");
  title.id = "vg-overlay-title";
  title.className = `${isBlockDecision ? "title-warn" : "title-info"}`;
  title.textContent = isBlockDecision
    ? "Submission Blocked by Policy"
    : "Sensitive Content Detected — Review Required";

  header.appendChild(icon);
  header.appendChild(title);
  modal.appendChild(header);

  // ---- Description ----
  const desc = document.createElement("p");
  desc.textContent = isBlockDecision
    ? "This submission contains content that your privacy policy does not permit sending. You can edit the message and remove the sensitive content before sending."
    : `Sensitive content was detected (${engineResult.findings.length} finding${engineResult.findings.length !== 1 ? "s" : ""}). Review the sanitized version below and choose to send it or edit the original.`;
  modal.appendChild(desc);

  // ---- Policy summary ----
  if (engineResult.summary) {
    const summaryEl = document.createElement("p");
    summaryEl.style.cssText = "font-size:0.82rem;color:#94a3b8;font-style:italic;";
    summaryEl.textContent = `Policy: ${engineResult.summary}`;
    modal.appendChild(summaryEl);
  }

  // ---- Original text diff ----
  const origLabel = document.createElement("div");
  origLabel.className = "section-label";
  origLabel.textContent = "Original (sensitive content highlighted)";
  modal.appendChild(origLabel);
  modal.appendChild(buildDiffBox(originalText, engineResult.findings));

  // ---- Sanitized text ----
  if (!isBlockDecision) {
    const sanLabel = document.createElement("div");
    sanLabel.className = "section-label";
    sanLabel.textContent = "Sanitized version (will be sent)";
    modal.appendChild(sanLabel);
    modal.appendChild(buildSanitizedBox(engineResult.sanitized_text, engineResult.findings));
  }

  // ---- Finding chips ----
  if (engineResult.findings.length > 0) {
    const chipsLabel = document.createElement("div");
    chipsLabel.className = "section-label";
    chipsLabel.textContent = "Detected entities";
    modal.appendChild(chipsLabel);

    const chipList = document.createElement("div");
    chipList.className = "findings-list";
    for (const f of engineResult.findings) {
      const chip = document.createElement("span");
      chip.className = "finding-chip";
      chip.textContent = `${f.entity_type} (${f.action})`;
      chipList.appendChild(chip);
    }
    modal.appendChild(chipList);
  }

  // ---- Context Intelligence (Why) ----
  const whySection = buildWhySection(engineResult.context);
  if (whySection) {
    modal.appendChild(whySection);
  }

  // ---- Utility notice ----
  if (engineResult.may_change_result && !isBlockDecision) {
    const notice = document.createElement("div");
    notice.className = "utility-notice";
    notice.textContent =
      "⚠ Sanitization may alter model response quality. The AI sees placeholders instead of original values.";
    modal.appendChild(notice);
  }

  // ---- Actions ----
  const actions = document.createElement("div");
  actions.className = "actions";

  const allowedOptions = engineResult.options && engineResult.options.length > 0
    ? engineResult.options
    : isBlockDecision
    ? ["edit", "cancel"]
    : ["send_sanitized", "edit", "cancel"];

  // 1. Cancel button
  if (allowedOptions.includes("cancel")) {
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      if (opts.onCancel) {
        opts.onCancel();
      } else {
        onEdit();
      }
    });
    actions.appendChild(cancelBtn);
  }

  // 2. Edit Original button
  if (allowedOptions.includes("edit")) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-edit";
    editBtn.textContent = "← Edit Original";
    editBtn.addEventListener("click", (e) => {
      // Reject synthetic / programmatic clicks (isTrusted guard)
      if (!e.isTrusted) return;
      onEdit();
    });
    actions.appendChild(editBtn);
  }

  // 3. Send Original (with secondary confirmation step for require_approval)
  if (allowedOptions.includes("send_original_confirmed") && opts.onSendOriginalConfirmed) {
    const sendOrigBtn = document.createElement("button");
    sendOrigBtn.type = "button";
    sendOrigBtn.className = "btn-send-original";
    sendOrigBtn.textContent = "Send Original (Unsanitized)";
    sendOrigBtn.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      // Secondary confirmation
      actions.innerHTML = "";
      const confirmWarning = document.createElement("p");
      confirmWarning.id = "vg-confirm-warning";
      confirmWarning.style.cssText = "color:#f87171;font-weight:600;font-size:0.85rem;margin-bottom:8px;";
      confirmWarning.textContent = "⚠ Are you sure? This will transmit raw sensitive data without pseudonymization.";
      modal.insertBefore(confirmWarning, actions);

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "btn-send-original";
      confirmBtn.id = "vg-btn-confirm-send";
      confirmBtn.textContent = "Yes, Send Original Unsanitized";
      confirmBtn.addEventListener("click", (ev) => {
        if (!ev.isTrusted) return;
        confirmBtn.disabled = true;
        opts.onSendOriginalConfirmed!();
      });

      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "btn-edit";
      backBtn.textContent = "No, Go Back";
      backBtn.addEventListener("click", (ev) => {
        if (!ev.isTrusted) return;
        confirmWarning.remove();
        showReviewOverlay(opts);
      });

      actions.appendChild(backBtn);
      actions.appendChild(confirmBtn);
    });
    actions.appendChild(sendOrigBtn);
  }

  // 4. Send Sanitized button (if allowed and not block)
  if (!isBlockDecision && allowedOptions.includes("send_sanitized")) {
    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "btn-send";
    sendBtn.textContent = "Send Sanitized →";
    sendBtn.setAttribute("aria-describedby", "vg-overlay-title");

    // isTrusted guard: reject automated clicks from test harness or injected scripts
    sendBtn.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      sendBtn.disabled = true;
      sendBtn.textContent = "Sending…";
      onSendSanitized();
    });
    actions.appendChild(sendBtn);
  }

  modal.appendChild(actions);
  backdrop.appendChild(modal);
  root.appendChild(buildStyleEl());
  root.appendChild(backdrop);

  // Focus trap and Escape handler
  focusTrapCleanup = trapFocus(modal, root);
  escapeCleanup = attachEscapeHandler(() => {
    if (opts.onCancel) {
      opts.onCancel();
    } else {
      onEdit();
    }
  });
}

/**
 * Shows a fail-closed engine error overlay (no submission bypass option).
 * Called when engine is unreachable, returns auth error, or times out.
 */
export function showEngineErrorOverlay(
  errorKind: string,
  errorMessage: string,
  onDismiss: () => void
): void {
  const root = ensureHost();
  clearOverlay();
  if (overlayHost) overlayHost.style.pointerEvents = "auto";

  const isAuthError = errorKind === "auth_error";
  const isBackstop = errorKind === "backstop";

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role", "alertdialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "vg-err-title");

  const header = document.createElement("div");
  header.className = "modal-header";
  const icon = document.createElement("div");
  icon.className = "icon icon-err";
  icon.textContent = "!";
  const title = document.createElement("h2");
  title.id = "vg-err-title";
  title.className = "title-err";
  title.textContent = isBackstop
    ? "Programmatic Submission Intercepted"
    : isAuthError
    ? "VeilGuard: Authentication Error"
    : "VeilGuard: Engine Unreachable";
  header.appendChild(icon);
  header.appendChild(title);
  modal.appendChild(header);

  const desc = document.createElement("p");
  desc.textContent = isBackstop
    ? errorMessage
    : isAuthError
    ? "The VeilGuard engine rejected the bearer token. Open VeilGuard Settings and verify your token. Submission was blocked."
    : "The VeilGuard privacy engine is not running or is unreachable. Your submission was blocked to protect your privacy. Start the local engine and try again.";
  modal.appendChild(desc);

  if (!isBackstop && !isAuthError) {
    const detail = document.createElement("p");
    detail.style.cssText = "font-size:0.78rem;color:#64748b;font-family:monospace;";
    detail.textContent = `Error: ${errorMessage}`;
    modal.appendChild(detail);

    const hint = document.createElement("p");
    hint.style.cssText = "font-size:0.82rem;color:#94a3b8;";
    hint.textContent = "Start the engine: cd engine && python -m veilguard_engine";
    modal.appendChild(hint);
  }

  const notice = document.createElement("div");
  notice.className = "utility-notice";
  notice.textContent =
    "🔒 Protection Inactive — submission was blocked. No content was transmitted to the AI service.";
  modal.appendChild(notice);

  const actions = document.createElement("div");
  actions.className = "actions";
  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.className = "btn-dismiss";
  const handleDismiss = () => {
    clearOverlay();
    onDismiss();
  };

  dismissBtn.textContent = "Dismiss";
  dismissBtn.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    handleDismiss();
  });
  actions.appendChild(dismissBtn);
  modal.appendChild(actions);

  backdrop.appendChild(modal);
  root.appendChild(buildStyleEl());
  root.appendChild(backdrop);

  focusTrapCleanup = trapFocus(modal, root);
  escapeCleanup = attachEscapeHandler(handleDismiss);
}

/**
 * Legacy compatibility: showBlockedOverlay used in Phase 1 tests.
 * Now wraps showEngineErrorOverlay with the "backstop" path.
 */
export function showBlockedOverlay(): void {
  showEngineErrorOverlay(
    "backstop",
    "Sensitive content was detected. The message was not sent.",
    hideOverlay
  );
}

let attachmentNoticeTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Non-blocking notice for file attachments (Phase 4 Part B, Section 6.3).
 * Shows a floating toast indicating attachments are not yet scanned.
 */
export function showAttachmentNotice(): void {
  const root = ensureHost();
  let notice = root.getElementById("vg-attachment-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "vg-attachment-notice";
    notice.style.position = "fixed";
    notice.style.bottom = "24px";
    notice.style.right = "24px";
    notice.style.maxWidth = "360px";
    notice.style.padding = "12px 16px";
    notice.style.borderRadius = "8px";
    notice.style.backgroundColor = "#1e293b";
    notice.style.color = "#f8fafc";
    notice.style.border = "1px solid #f59e0b";
    notice.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.4)";
    notice.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    notice.style.fontSize = "13px";
    notice.style.lineHeight = "1.4";
    notice.style.zIndex = "2147483647";
    notice.style.pointerEvents = "auto";
    notice.style.display = "flex";
    notice.style.alignItems = "center";
    notice.style.gap = "10px";

    const textSpan = document.createElement("span");
    textSpan.textContent = "Attachments are not scanned by VeilGuard yet. Their contents are not checked.";
    notice.appendChild(textSpan);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.background = "none";
    closeBtn.style.border = "none";
    closeBtn.style.color = "#94a3b8";
    closeBtn.style.fontSize = "18px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.padding = "0 4px";
    closeBtn.onclick = () => {
      notice?.remove();
    };
    notice.appendChild(closeBtn);

    root.appendChild(notice);
  }

  if (attachmentNoticeTimeout) clearTimeout(attachmentNoticeTimeout);
  attachmentNoticeTimeout = setTimeout(() => {
    notice?.remove();
    attachmentNoticeTimeout = null;
  }, 5000);
}

