import { describe, it, expect } from "vitest";
import { UniversalAIAdapter } from "../../extension/src/content/adapters/universal";

describe("UniversalAIAdapter Unit Tests", () => {
  const adapter = new UniversalAIAdapter();

  it("matches all supported AI hosts", () => {
    expect(adapter.matches({ hostname: "claude.ai" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "app.claude.ai" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "perplexity.ai" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "www.perplexity.ai" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "chat.deepseek.com" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "copilot.microsoft.com" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "poe.com" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "chat.mistral.ai" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "aistudio.google.com" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "gemini.google.com" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "chatgpt.com" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "wikipedia.org" } as Location)).toBe(false);
  });

  it("identifies send buttons with various aria-labels and data-testids", () => {
    const btn1 = {
      getAttribute(attr: string) {
        if (attr === "aria-label") return "Send message";
        return null;
      },
      classList: { contains: () => false },
      matches: () => false,
      closest: () => null,
      tagName: "BUTTON",
    };
    expect(adapter.isSendButton(btn1 as unknown as EventTarget)).toBe(true);

    const btn2 = {
      getAttribute(attr: string) {
        if (attr === "data-testid") return "submit-button";
        return null;
      },
      classList: { contains: () => false },
      matches: () => false,
      closest: () => null,
      tagName: "BUTTON",
    };
    expect(adapter.isSendButton(btn2 as unknown as EventTarget)).toBe(true);

    const nonBtn = {
      getAttribute: () => null,
      classList: { contains: () => false },
      matches: () => false,
      closest: () => null,
      tagName: "DIV",
    };
    expect(adapter.isSendButton(nonBtn as unknown as EventTarget)).toBe(false);
  });
});
