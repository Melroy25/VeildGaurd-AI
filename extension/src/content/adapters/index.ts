import { SiteAdapter } from "./types";
import { mockSiteAdapter } from "./mock-site";
import { chatgptAdapter } from "./chatgpt";
import { geminiAdapter } from "./gemini";

const REGISTERED_ADAPTERS: SiteAdapter[] = [mockSiteAdapter, chatgptAdapter, geminiAdapter];

/**
 * Resolves the appropriate site adapter for the current browser location.
 */
export function getAdapterForLocation(location: Location = window.location): SiteAdapter | null {
  for (const adapter of REGISTERED_ADAPTERS) {
    if (adapter.matches(location)) {
      return adapter;
    }
  }
  return null;
}

export * from "./types";
export * from "./mock-site";
export * from "./chatgpt";
export * from "./gemini";
