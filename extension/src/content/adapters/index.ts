import { SiteAdapter } from "./types";
import { mockSiteAdapter } from "./mock-site";
import { chatgptAdapter } from "./chatgpt";
import { geminiAdapter } from "./gemini";
import { universalAIAdapter } from "./universal";

const REGISTERED_ADAPTERS: SiteAdapter[] = [
  mockSiteAdapter,
  chatgptAdapter,
  geminiAdapter,
  universalAIAdapter,
];

/**
 * Resolves the appropriate site adapter for the current browser location.
 */
export function getAdapterForLocation(location: Location = window.location): SiteAdapter | null {
  for (const adapter of REGISTERED_ADAPTERS) {
    if (adapter.matches(location)) {
      return adapter;
    }
  }

  // Fallback: If on any page that contains an editable composer, universal adapter can protect it
  const host = location.hostname.toLowerCase();
  const AI_KEYWORDS = ["ai", "chat", "bot", "llm", "claude", "gemini", "gpt", "deepseek", "copilot", "perplexity", "grok", "x.ai"];
  for (const kw of AI_KEYWORDS) {
    if (host.includes(kw)) {
      return universalAIAdapter;
    }
  }

  return null;
}

export * from "./types";
export * from "./mock-site";
export * from "./chatgpt";
export * from "./gemini";
export * from "./universal";
