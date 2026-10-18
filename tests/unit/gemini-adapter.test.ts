import { describe, it, expect } from "vitest";
import { GeminiAdapter } from "../../extension/src/content/adapters/gemini";

describe("GeminiAdapter Unit Tests", () => {
  const adapter = new GeminiAdapter();

  it("matches gemini.google.com and subdomains", () => {
    expect(adapter.matches({ hostname: "gemini.google.com" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "app.gemini.google.com" } as Location)).toBe(true);
    expect(adapter.matches({ hostname: "chatgpt.com" } as Location)).toBe(false);
    expect(adapter.matches({ hostname: "localhost" } as Location)).toBe(false);
  });

  it("identifies send button from target attributes", () => {
    const fakeBtn = {
      getAttribute(attr: string) {
        if (attr === "aria-label") return "Send message";
        return null;
      },
      classList: { contains: () => false },
      querySelector: () => null,
      matches: () => false,
      closest: () => null,
      tagName: "BUTTON",
    };

    expect(adapter.isSendButton(fakeBtn as unknown as EventTarget)).toBe(true);
  });

  it("identifies send button from send-button class", () => {
    const fakeBtn = {
      getAttribute: () => null,
      classList: { contains: (cls: string) => cls === "send-button" },
      querySelector: () => null,
      matches: () => false,
      closest: () => null,
      tagName: "DIV",
    };

    expect(adapter.isSendButton(fakeBtn as unknown as EventTarget)).toBe(true);
  });

  it("identifies send button from mat-icon data-mat-icon-name", () => {
    const fakeIcon = {
      getAttribute(attr: string) {
        if (attr === "data-mat-icon-name") return "send";
        return null;
      },
      classList: { contains: () => false },
      querySelector: () => null,
      matches: () => false,
      closest: () => null,
      tagName: "MAT-ICON",
    };

    expect(adapter.isSendButton(fakeIcon as unknown as EventTarget)).toBe(true);
  });

  it("rejects non-send buttons", () => {
    const fakeBtn = {
      getAttribute(attr: string) {
        if (attr === "aria-label") return "Clear conversation";
        return null;
      },
      classList: { contains: () => false },
      querySelector: () => null,
      matches: () => false,
      closest: () => null,
      tagName: "BUTTON",
    };

    expect(adapter.isSendButton(fakeBtn as unknown as EventTarget)).toBe(false);
  });
});
