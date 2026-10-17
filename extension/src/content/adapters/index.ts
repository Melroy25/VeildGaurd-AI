import { SiteAdapter } from "./types";
import { mockSiteAdapter } from "./mock-site";
import { chatgptAdapter } from "./chatgpt";

const REGISTERED_ADAPTERS: SiteAdapter[] = [mockSiteAdapter, chatgptAdapter];

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
