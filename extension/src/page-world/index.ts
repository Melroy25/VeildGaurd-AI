/**
 * VeilGuard AI - MAIN-World Fetch and XMLHttpRequest Backstop.
 *
 * Runs in the host page's execution context (world: "MAIN") at document_start.
 * Intercepts synthetic, programmatic, or direct API submissions targeting
 * the chat endpoint even if DOM-level listeners were bypassed.
 *
 * Phase 3b: Engine-backed verdict via postMessage handshake.
 *   - When a request is intercepted, this script sends a CHECK_REQUEST message
 *     to the ISOLATED-world content script via window.postMessage.
 *   - The content script queries the background for an engine analysis.
 *   - The verdict arrives back as a VEILGUARD_VERDICT message.
 *   - Fail-closed: if no verdict arrives within VERDICT_TIMEOUT_MS, the
 *     request is blocked (Rule 6).
 *   - Approved requests that were previously analyzed are cached in an
 *     in-memory approved set to allow the re-triggered submission through.
 *
 * Rule 7: No raw prompt text is logged.
 * Rule 6: Default posture is block; only explicit "allow" verdicts proceed.
 */

(() => {
  interface WindowWithVeilguard extends Window {
    __veilguard_page_world_installed?: boolean;
  }

  const win = window as WindowWithVeilguard;
  if (win.__veilguard_page_world_installed) {
    return;
  }
  win.__veilguard_page_world_installed = true;

  function isChatEndpoint(url: string): boolean {
    return (
      url.includes("/api/chat") ||
      url.includes("/backend-api/conversation") ||
      url.includes("/backend-anon/conversation") ||
      url.includes("/unauth-mweb/conversation")
    );
  }

  const VERDICT_TIMEOUT_MS = 6000; // Slightly above engine 5s timeout

  // ---------------------------------------------------------------------------
  // Approved request cache (keyed by request fingerprint)
  // ---------------------------------------------------------------------------

  const approvedFingerprints = new Map<string, number>();
  const APPROVAL_TTL_MS = 30000;

  /**
   * Normalizes text for comparing approved text against outbound payloads.
   * Collapses all whitespace sequences to a single space and trims.
   */
  function normalizeForApproval(text: string): string {
    if (!text) return "";
    return text.replace(/\s+/g, " ").trim();
  }

  function fingerprintText(text: string): string {
    const norm = normalizeForApproval(text);
    return `${norm.length}:${norm}`;
  }

  function isApproved(text: string): boolean {
    const fp = fingerprintText(text);
    const ts = approvedFingerprints.get(fp);
    if (ts == null) return false;
    if (Date.now() - ts > APPROVAL_TTL_MS) {
      approvedFingerprints.delete(fp);
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Pending verdict callbacks
  // ---------------------------------------------------------------------------

  type VerdictCallback = (allow: boolean) => void;
  const pendingVerdicts = new Map<string, VerdictCallback>();

  /**
   * Requests a verdict from the content script (which calls the engine).
   * Returns a promise that resolves to true (allow) or false (block).
   * Fails closed after VERDICT_TIMEOUT_MS.
   */
  function requestVerdict(text: string, transport: "fetch" | "xhr"): Promise<boolean> {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<boolean>((resolve) => {
      // Timeout: fail closed
      const timer = setTimeout(() => {
        pendingVerdicts.delete(requestId);
        resolve(false);
      }, VERDICT_TIMEOUT_MS);

      pendingVerdicts.set(requestId, (allow: boolean) => {
        clearTimeout(timer);
        pendingVerdicts.delete(requestId);
        if (allow) {
          // Cache approval so re-triggered submission passes through
          approvedFingerprints.set(fingerprintText(text), Date.now());
        }
        resolve(allow);
      });

      // Notify content script — send only metadata (request ID + text length),
      // NOT the raw text, for the CHECK_REQUEST message type.
      // The actual text analysis happens in the content script → background channel.
      window.postMessage(
        {
          type: "VEILGUARD_CHECK_REQUEST",
          requestId,
          transport,
          // We must send the text here for the engine to analyze it.
          // The content script does NOT log it — only passes it to background.
          // Rule 7 is enforced in the content script and background.
          text,
          destination: window.location.hostname,
        },
        "*"
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Listen for verdict responses from content script
  // ---------------------------------------------------------------------------

  window.addEventListener("veilguard_pre_approve", ((event: CustomEvent<{ text?: string }>) => {
    if (event.detail && typeof event.detail.text === "string") {
      approvedFingerprints.set(fingerprintText(event.detail.text), Date.now());
    }
  }) as EventListener);

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!event.data) return;

    if (event.data.type === "VEILGUARD_PRE_APPROVE" && typeof event.data.text === "string") {
      approvedFingerprints.set(fingerprintText(event.data.text), Date.now());
      return;
    }

    if (event.data.type === "VEILGUARD_VERDICT") {
      const { requestId, allow } = event.data as { requestId: string; allow: boolean };
      const callback = pendingVerdicts.get(requestId);
      if (callback) {
        callback(Boolean(allow));
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Payload extraction helper (supports strings, JSON, Blobs, ArrayBuffers)
  // ---------------------------------------------------------------------------

  async function extractMessageFromPayloadAsync(body: unknown): Promise<string> {
    if (!body) return "";

    // Reject unreadable streaming bodies per Rule 6 and Phase 4 spec
    if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
      throw new TypeError("Failed to fetch: request blocked by VeilGuard AI backstop (unreadable streaming body).");
    }

    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body);
        if (parsed && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          const first = parsed.messages[0];
          if (first?.content?.parts && Array.isArray(first.content.parts)) {
            return first.content.parts.filter((p: unknown) => typeof p === "string").join("\n");
          }
        }
        if (parsed && typeof parsed.message === "string") return parsed.message;
        if (parsed && typeof parsed.text === "string") return parsed.text;
        if (parsed && typeof parsed.prompt === "string") return parsed.prompt;
      } catch {
        // Plain text payload
      }
      return body;
    }

    if (typeof Blob !== "undefined" && body instanceof Blob) {
      const text = await body.text();
      return extractMessageFromPayloadAsync(text);
    }

    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(body);
      return extractMessageFromPayloadAsync(text);
    }

    return "";
  }

  // ---------------------------------------------------------------------------
  // Notify content script of a block (for overlay display)
  // ---------------------------------------------------------------------------

  function notifyBlocked(transport: "fetch" | "xhr"): void {
    window.postMessage(
      {
        type: "VEILGUARD_BACKSTOP_BLOCKED",
        transport,
        timestamp: Date.now(),
      },
      "*"
    );
  }

  // ---------------------------------------------------------------------------
  // 1. Monkey-patch window.fetch
  // ---------------------------------------------------------------------------

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    const patchedFetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      let requestUrl = "";
      if (typeof input === "string") {
        requestUrl = input;
      } else if (input instanceof URL) {
        requestUrl = input.toString();
      } else if (input && typeof (input as Request).url === "string") {
        requestUrl = (input as Request).url;
      }

      if (isChatEndpoint(requestUrl)) {
        // Notify content script that a chat request was observed (feeds the Canary timer)
        window.postMessage({ type: "VEILGUARD_CHAT_OBSERVED", url: requestUrl }, "*");

        let messageText = "";

        if (!init?.body && input instanceof Request) {
          try {
            const clone = input.clone();
            const bodyText = await clone.text();
            messageText = await extractMessageFromPayloadAsync(bodyText);
          } catch (err: unknown) {
            notifyBlocked("fetch");
            throw new TypeError(
              err instanceof Error ? err.message : "Failed to fetch: request blocked by VeilGuard AI backstop (unreadable body)."
            );
          }
        } else {
          try {
            messageText = await extractMessageFromPayloadAsync(init?.body);
          } catch (err: unknown) {
            notifyBlocked("fetch");
            throw new TypeError(
              err instanceof Error ? err.message : "Failed to fetch: request blocked by VeilGuard AI backstop (unreadable body)."
            );
          }
        }

        if (messageText) {
          const approved = isApproved(messageText);
          if (approved) {
            return originalFetch.apply(window, [input, init]);
          }

          const allowed = await requestVerdict(messageText, "fetch");
          if (!allowed) {
            notifyBlocked("fetch");
            throw new TypeError("Failed to fetch: request blocked by VeilGuard AI backstop.");
          }
          // Allowed — fall through to original fetch
        }
      }

      return originalFetch.apply(window, [input, init]);
    };

    try {
      Object.defineProperty(patchedFetch, "name", { value: "fetch" });
      Object.defineProperty(patchedFetch, "length", { value: 1 });
    } catch {
      // Ignored if non-configurable
    }

    window.fetch = patchedFetch;
  }

  // ---------------------------------------------------------------------------
  // 2. Monkey-patch XMLHttpRequest
  // ---------------------------------------------------------------------------

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  const xhrUrlMap = new WeakMap<XMLHttpRequest, string>();

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ): void {
    const resolvedUrl = url ? url.toString() : "";
    xhrUrlMap.set(this, resolvedUrl);
    return originalOpen.apply(this, [
      method,
      url,
      async ?? true,
      username ?? null,
      password ?? null,
    ]);
  };

  XMLHttpRequest.prototype.send = function (
    body?: Document | XMLHttpRequestBodyInit | null
  ): void {
    const targetUrl = xhrUrlMap.get(this) || "";
    if (isChatEndpoint(targetUrl)) {
      window.postMessage({ type: "VEILGUARD_CHAT_OBSERVED", url: targetUrl }, "*");

      // Reject unreadable streaming bodies per Rule 6
      if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
        notifyBlocked("xhr");
        this.dispatchEvent(new ProgressEvent("error"));
        return;
      }

      const self = this;
      const savedBody = body;

      extractMessageFromPayloadAsync(body).then((messageText) => {
        if (messageText) {
          if (isApproved(messageText)) {
            return originalSend.apply(self, [savedBody]);
          }

          requestVerdict(messageText, "xhr").then((allowed) => {
            if (!allowed) {
              notifyBlocked("xhr");
              self.dispatchEvent(new ProgressEvent("error"));
              return;
            }
            originalSend.apply(self, [savedBody]);
          }).catch(() => {
            notifyBlocked("xhr");
            self.dispatchEvent(new ProgressEvent("error"));
          });
          return;
        }
        originalSend.apply(self, [savedBody]);
      }).catch(() => {
        notifyBlocked("xhr");
        self.dispatchEvent(new ProgressEvent("error"));
      });

      return;
    }
    return originalSend.apply(this, [body]);
  };
})();

