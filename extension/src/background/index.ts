/**
 * VeilGuard AI - Background Service Worker (Manifest V3)
 *
 * In Phase 0, this only logs an initialization message.
 * No user content is inspected or persisted.
 */

console.log("[VeilGuard AI] Background service worker initialized (Phase 0 scaffold).");

chrome.runtime.onInstalled.addListener(() => {
  console.log("[VeilGuard AI] Extension installed/updated.");
});
