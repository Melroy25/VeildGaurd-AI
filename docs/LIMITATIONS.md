# VeilGuard AI: Known Limitations

> **Honesty Invariant (Rule 3):** Never claim complete protection. Known limitations are documented here and must be communicated transparently in UI components and project presentations.

---

## 1. DOM Volatility & Site Changes
- Modern web applications (e.g., ChatGPT, Claude) frequently update their front-end architecture, class names, DOM hierarchy, and event handling mechanisms.
- Site adapters rely on known DOM selectors and mutation observers. If an AI site deploys major structural updates, interception hooks may break. In such cases, VeilGuard fails closed or displays a "Protection Inactive / Unverified" indicator.

## 2. Non-Exhaustive Submission Interception
- While VeilGuard implements multi-layer interception (DOM submit listeners, Enter key traps, button clicks, and a MAIN-world `fetch` / `XMLHttpRequest` monkey-patch), web applications can utilize exotic transmission channels (e.g., WebSockets, WebRTC, Service Worker sync, WebTransport).
- Not every theoretical exfiltration channel can be intercepted by an extension without browser-level binary modifications. Any unsupported path must be explicitly acknowledged as unprotected.

## 3. Detection Recall Boundaries (Rule-Based & Statistical NER)
- Statistical NER models (such as spaCy and Presidio) and regex recognizers operate on probabilistic and syntactic patterns. They are not infallible:
  - Novel, misspelled, or intentionally obfuscated personal identifiers may bypass detection.
  - Rare domain-specific terminology may trigger false positives.
  - Highly contextual secrets (e.g., unstructured business logic secrets) cannot be detected without deep semantic reasoning.

## 4. AI Utility & Semantic Shifts from Sanitization
- Transforming sensitive tokens (e.g., replacing names with `[CUSTOMER_1]` or generalizing dates to year-only) modifies the input prompt.
- While VeilGuard strives for utility-preserving pseudonymization, downstream LLM behavior may differ compared to raw prompts:
  - Contextual nuance, tone, or grammatical consistency might shift.
  - LLMs may occasionally hallucinate or mishandle surrogate placeholder tokens.
  - The review overlay must explicitly inform users that sanitization "may alter model response quality."

## 5. Local Engine Dependency
- VeilGuard relies on a local background Python engine running on loopback (`127.0.0.1:8765`).
- If the local Python process is terminated, not started, or experiences an unhandled crash, the extension cannot inspect submissions.
- By design (Rule 6: Fail Closed), when the local engine is unreachable, the extension must block submission or display a prominent blocking warning, preventing silent data leakage.

## 6. Ephemeral Extension Memory in Manifest V3
- Under Chrome Manifest V3, background service workers are ephemeral and will be terminated after periods of inactivity.
- State cannot be maintained in global JavaScript memory. The placeholder pseudonymization vault is restricted to `chrome.storage.session`, which is bounded by browser session lifespan and is cleared upon browser restart.

## 7. Mock-Site Scope Boundary (Phase 1)
- In Phase 1, enforcement has been verified strictly against the deterministic standalone testbed (`127.0.0.1:4310`).
- No production third-party AI website adapters (such as ChatGPT or Claude) are implemented or registered in Phase 1; adapter registration is scheduled for Phase 4.
- Content scripts and host permissions are scoped exclusively to `http://127.0.0.1:4310/*` and `http://localhost:4310/*` per Rule 9 (Least Privilege).
- Detection logic in Phase 1 utilizes a synchronous regex harness stub (`isFlagged()` in `extension/src/shared/stub-detector.ts`); full Presidio and local engine integration is scoped to Phase 2.

## 8. spaCy `en_core_web_sm` NER Recall Boundaries (Phase 2)
- The statistical named entity recognizer in `en_core_web_sm` relies on capitalization, grammatical sentence structure, and sufficient surrounding context tokens.
- **Lowercase names:** Submitting a name entirely in lowercase (e.g., `"patient john doe"`) will not be recognized as a PERSON entity. The model requires standard title-case input.
- **Short fragments without context:** Isolated name strings in non-sentence fragments (e.g., `"name: subramanian"`) lack the grammatical context cues the statistical model requires and will be missed.
- **Transliterated Indian regional names:** Uncommon transliterated South Indian names (e.g., `"Subramanian"`) without surrounding sentence context may be missed by `en_core_web_sm` because they are underrepresented in the English training corpus.
- **Mitigation path:** Upgrading to `en_core_web_lg` or a domain-adapted NER model would improve recall on these cases. This is noted as a **Future** improvement; the current baseline uses `en_core_web_sm` per the original Phase 2 spec.
- These limitations are explicitly documented as `xfail(strict=True)` tests in `tests/engine/test_known_limitations.py`.

