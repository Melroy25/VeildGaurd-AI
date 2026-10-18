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

## 9. Type-Based Sanitization & Task-Agnostic Boundaries (Phase 3a)
- **Not task-aware:** Phase 3a sanitization operates strictly on entity types and declarative policy rules; it does not yet infer user task intent or determine task-necessity (scheduled for Phase 5).
- **Type-based placeholders:** Placeholders are strictly categorical (`[PERSON_1]`, `[PHONE_1]`), not semantic or role-based (e.g. `[CUSTOMER_1]`, `[MERCHANT_1]`).
- **Conservative utility notices:** The `may_change_result` notice is purely type-based (`possible` whenever an entity is replaced, masked, or removed) and cannot yet evaluate whether the replacement will realistically degrade model output.
- **No coreference resolution:** The engine does not perform entity coreference. It will not link an isolated first name (`Rahul`) to a full name (`Rahul Sharma`) appearing in the same text.
- **Partial masking information disclosure:** Masking keeps the last 4 digits (e.g. `XXXX XXXX 3456`), which intentionally reveals partial information for user readability but may not satisfy strict zero-disclosure requirements.
- **Non-exhaustive detection notice:** Sanitized text may still contain undetected sensitive entities if novel, obfuscated, or unmodeled patterns were present in the prompt. Users must review sanitized text before sending.
 
## 10. Presidio Country-Specific Recognizer Dormancy
- Microsoft Presidio includes country-specific recognizer classes (e.g. `InPanRecognizer`, `InAadhaarRecognizer`) within its codebase, but excludes them from its standard `AnalyzerEngine` default registry.
- Deploying standard stock Presidio out-of-the-box yields near-zero recall for Indian identifiers unless explicit custom registry assembly is performed.
- VeilGuard addresses this by providing dedicated, algorithmically validated detectors (Verhoeff checksum for Aadhaar, mod-36 for GSTIN, PAN character verification, context-window gated bank accounts) integrated natively into the scanner.

## 11. Medical Term Detection Scope & Lexicon (Updated Phase 5)
- In Phase 5, VeilGuard added a curated 252-term medical lexicon (`data/medical_terms.txt`) and the `HEALTH_WITH_IDENTITY` policy rule.
- When clinical terms appear alongside direct personal identifiers or a high re-identification score, direct identity is pseudonymized while medical terms are preserved to maintain AI utility.
- However, medical detection remains dictionary-based and is **non-exhaustive**. Unlisted rare diseases, experimental medications, or clinical shorthand not in the dictionary will not be detected as medical entities.

## 12. Context Intelligence & Benchmark Limitations (Phase 5)
- **Lexical, English-Only Task Inference**: Task intent classification relies on ordered keyword and verb cues in English. It does not perform semantic embedding lookups or support multilingual prompts; non-standard or foreign language prompts fall back to `unknown`.
- **Heuristic Re-Identification Scoring**: The weights in `reid/weights.yaml` and the Noisy-OR combination formula are expert-designed heuristics, tuned on development data. The score is a relative risk index, **NOT** an empirical probability of re-identification in the wild.
- **Synthetic, Same-Team Dataset**: All 519 benchmark prompts (233 dev + 286 test) were synthetically authored by the engineering team. This introduces inevitable inductive bias; performance on real production user prompts may vary.
- **Small Benchmark Sample Size**: While sufficient for directional evaluation ($N=286$ on test), several subcategories (e.g. `financial` $n=19$, `utility_tasks` $n=18$) have small counts, resulting in wide confidence intervals.
- **Unvalidated Semantic Drift (`may_change_result`)**: The utility prediction (`may_change_result`) is a rule-based signal derived from whether required/optional details were altered. It has not been empirically verified against live downstream generations from OpenAI or Anthropic models.
- **Statistical NER Sensitivity**: Small statistical models (`en_core_web_sm`) continue to miss lowercase names or uncommon transliterated Indian names without clear sentence context.

## 13. Local Audit History & Dashboard Scope Boundaries (Phase 3c)
- **Local persistence only:** Event history is stored strictly in `chrome.storage.local` on the client device. It is not synchronized across devices, backed up to any cloud or remote endpoint (Rule 8), and is permanently cleared if the extension is uninstalled.
- **Fixed retention ring buffer (1000 events):** Event history is capped at the newest 1000 events. Older events are silently evicted to prevent unbounded storage consumption.
- **Documents scanned count:** The dashboard summary card displays document events recorded via the dedicated PDF Scanner tab in the Options page. Document scanning is supported for PDF documents up to 10 MB and 50 pages.
- **Dashboard counts describe local activity, not detection accuracy:** The counts, decision breakdowns, and user action distributions reflect activity intercepted on this specific browser profile. They are not benchmark precision or recall metrics. Benchmark metrics are computed independently in Phase 5/6.
- **Popup protection status visibility:** Without the privileged `tabs` permission, the action popup queries only the active tab's content script via `chrome.tabs.sendMessage`. It cannot inspect arbitrary tabs or determine protection status on domains where VeilGuard has no registered content script, cleanly reporting "Not active on this site (unsupported site)". Never implies protection where none exists.

## 14. In-Chat File Attachments vs. Document Scanner (Phase 6 Update)
- In Phase 6, VeilGuard AI includes a dedicated **PDF Document Scanner & True Redaction** tab in the Options dashboard for pre-sanitizing documents before upload.
- However, direct in-chat file attachments dropped into the third-party web composer (e.g., ChatGPT file upload paperclip) are not yet synchronously intercepted in real-time within the chat DOM.
- A non-blocking notice is displayed to users: *"To sanitize documents, use the VeilGuard Document Scanner tab before attaching."*
- Full automated in-line interception of third-party DOM file drop events is scheduled for post-hackathon roadmap.

## 15. PDF Document Scanning Boundaries (Phase 6)
- **Text-Based / Vector PDFs Only:** Document scanning operates directly on PDF character glyphs and text streams. Raster image-only scans (e.g. photos of paper documents without an embedded OCR text layer) do not contain extractable text glyphs and require upstream OCR preprocessing.
- **Size and Page Limits:** Processing is bounded in-memory to 10 MB maximum file size and 50 maximum pages. Larger documents are rejected to prevent local memory exhaustion.
- **Dual-Extractor Verification Scope:** Dual-extractor verification checks that target sensitive values detected during the initial scan do not appear in PyMuPDF or pypdf extracted text. If novel or unmodeled entities were not detected in the first pass, they cannot be checked for residual presence. User visual inspection remains recommended.

## 16. Voice / Audio Input (Phase 4)
- ChatGPT's voice dictation mode streams audio from the microphone directly to OpenAI's servers via real-time audio APIs.
- VeilGuard AI does not intercept audio streams. This path is unprotected and must be prominently declared to users.
- The badge does not claim protection on voice-mode submissions.

## 17. DOM Selector Volatility — ChatGPT (Phase 4, Verified 2026-10-17)
- The ChatGPT adapter's DOM selectors were verified on 2026-10-17 against the live site at `https://chatgpt.com`:
  - Composer: `#mobile-composer-prompt` (TEXTAREA, `aria-label="Chat with ChatGPT"`)
  - Send Button: `button[aria-label="Send message"]` (`type="submit"`)
- ChatGPT (OpenAI) may update its front-end at any time. If selectors break, the adapter's `selfTest()` will fail and VeilGuard transitions to **Limited Protection** (backstop-only) mode, displayed on the badge.
- VeilGuard never silently claims full protection when adapter self-test fails (Rule 3).

## 18. Single Real-Site Target in Phase 4 (Phase 4)
- Phase 4 implements and verifies protection on ChatGPT (`https://chatgpt.com`) only.
- Claude, Gemini, Copilot, and other AI sites are **not supported** in Phase 4.
- The extension manifest grants host permissions only for `https://chatgpt.com/*` and `https://*.chatgpt.com/*` (in addition to the mock test site). No other AI sites receive injected scripts.
- Support for additional sites is scoped to future phase expansion cycles.

## 19. Presidio Email TLD Whitelisting (`.example` Domain Misses)
- Microsoft Presidio's stock `EmailRecognizer` validates email top-level domains against an internal whitelist of real-world TLDs (`.com`, `.org`, `.net`, `.in`, etc.) and does not recognize RFC 2606 reserved domains (`.example`, `.test`).
- In synthetic test corpora where email addresses utilize `.example` domains (e.g. `gaurav.rao@startup.example`), Presidio's recognizer fails to extract the email address.
- Regex-only baselines that match any alphanumeric sequence after `@` catch these domains, leading to higher keyword baseline F1 on synthetic email-only prompts.

## 20. Strict Luhn Checksum Enforcement on Credit Card Numbers
- VeilGuard relies on Presidio's `CreditCardRecognizer`, which strictly validates the Luhn algorithm checksum.
- Randomly generated 16-digit synthetic test sequences that do not satisfy the Luhn algorithm (e.g. `4412 8371 5636 9383`) are intentionally rejected as non-card numbers.
- Unvalidated regex filters flag any 16-digit sequence without checking mathematical validity, outscoring checksum-aware recognizers on synthetic datasets with invalid card numbers.

## 21. Multi-Detector Precision Trade-off in Indian ID Contexts
- In Indian government ID evaluation prompts (Aadhaar, PAN, GSTIN), VeilGuard detects the identity numbers with 100% recall.
- However, secondary detectors (spaCy NER and quasi-identifier detectors) frequently extract adjacent context tokens such as `"KYC"` (classified as `QUASI`) or `"Verify Aadhaar"` (spurious `PERSON` tag from spaCy).
- On benchmark items where ground truth only annotates the identifier itself, these extra extractions count as false positives in token/entity precision calculations, lowering VeilGuard's entity F1 relative to single-pattern keyword matchers that produce zero contextual extractions.

## 22. Site Coverage & Prototype Status (Rule 3)
- An AI website is designated as **Verified** only if the real-site automated test harness recorded passing cells for every claimed submission path ($N \ge 20$).
- Currently, only the local **Mock AI Chat Testbed** (`127.0.0.1:4310`) is Verified across all 14 cells.
- **ChatGPT** (`chatgpt.com`) is in **Prototype** status: while the unauthenticated logged-out send button and backstop are recorded in `bench/results/enforcement_real_site.json`, the Enter key, authenticated SPA sessions, and edit flows have not completed full multi-trial matrix runs.
- All other target AI sites (Google Gemini, Claude, Microsoft Copilot, Perplexity, DeepSeek, Poe, Mistral, Google AI Studio) utilize the universal contenteditable/ProseMirror adapter and are explicitly classified as **Prototype** until automated real-site trials are executed and recorded.

## 23. Desktop Sidebar Companion Prototype Status
- The Windows desktop companion (`desktop/sidebar_guard.py`) provides OS-level foreground detection, opt-in clipboard inspection, and PDF redaction.
- Per Rule 2, the desktop sidebar is classified as **Prototype** pending completion and recording of the formal manual verification checklist (`docs/SIDEBAR_VERIFICATION.md`).
- Clipboard inspection is disabled by default (opt-in only), activates strictly while an AI application is focused, renders a prominent visible indicator, and never writes clipboard content to persistent storage or logs.

## 24. Development Split Error Analysis Classification
- On the 233-record development split (`dev.jsonl`), categories where the keyword baseline scored differently were analyzed:
  - **`direct_pii`**: Keyword F1 0.657 vs VeilGuard F1 0.548. Classification: statistical NER span boundary variability in `en_core_web_sm` and false positive name extractions on informal/unpunctuated text vs exact regex tokens.
  - **`financial`**: Keyword F1 0.657 vs VeilGuard F1 0.103. Classification: Keyword baseline matches unvalidated 16-digit sequences indiscriminately (FP=22), whereas VeilGuard enforces strict structural/Luhn checksums and entity type boundaries.
  - **`india_ids`**: Keyword F1 0.809 vs VeilGuard F1 0.658. Classification: VeilGuard achieves 96.2% recall (TP=51 vs keyword's 36), but multi-detector span boundaries (e.g., overlapping entity tokens) yield lower IoU precision.
  - **`indirect_combo`**: Keyword F1 0.000 vs VeilGuard F1 0.770. Classification: Keyword filters have zero semantic capability to detect combinations of non-sensitive quasi-identifiers, where VeilGuard's re-identification scorer achieves 80.0% combination recall.

