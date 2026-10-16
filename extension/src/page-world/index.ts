import { isFlagged } from "../shared/stub-detector";

/**
 * VeilGuard AI - MAIN-World Fetch and XMLHttpRequest Backstop.
 *
 * Runs in the host page's execution context (world: "MAIN") at document_start.
 * Intercepts synthetic, programmatic, or direct API submissions targeting
 * the chat endpoint even if DOM-level listeners were bypassed.
 *
 * Rule 7: Never log or transmit sensitive prompt content. Metadata only.
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

  const CHAT_ENDPOINT = "/api/chat";

  function extractMessageFromPayload(body: unknown): string {
    if (!body) return "";
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.message === "string") {
          return parsed.message;
        }
      } catch {
        // Plain text payload
      }
      return body;
    }
    return "";
  }

  function notifyContentScript(transport: "fetch" | "xhr") {
    // Send strictly metadata to content script overlay listener
    window.postMessage(
      {
        type: "VEILGUARD_BACKSTOP_BLOCKED",
        transport,
        timestamp: Date.now(),
      },
      "*"
    );
  }

  // 1. Monkey-patch window.fetch
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

      if (requestUrl.includes(CHAT_ENDPOINT)) {
        let body: unknown = init?.body;

        if (!body && input instanceof Request) {
          try {
            const clone = input.clone();
            const text = await clone.text();
            if (isFlagged(extractMessageFromPayload(text))) {
              notifyContentScript("fetch");
              throw new TypeError("Failed to fetch: request blocked by VeilGuard AI backstop.");
            }
          } catch (e) {
            if (e instanceof TypeError && e.message.includes("VeilGuard")) {
              throw e;
            }
          }
        } else {
          const messageText = extractMessageFromPayload(body);
          if (isFlagged(messageText)) {
            notifyContentScript("fetch");
            throw new TypeError("Failed to fetch: request blocked by VeilGuard AI backstop.");
          }
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

  // 2. Monkey-patch XMLHttpRequest
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
    if (targetUrl.includes(CHAT_ENDPOINT)) {
      const messageText = extractMessageFromPayload(body);
      if (isFlagged(messageText)) {
        notifyContentScript("xhr");
        // Abort dispatch and simulate network error without transmitting
        this.dispatchEvent(new ProgressEvent("error"));
        return;
      }
    }
    return originalSend.apply(this, [body]);
  };
})();
