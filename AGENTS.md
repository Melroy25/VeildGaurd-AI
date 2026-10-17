# VeilGuard AI: Agent Guidelines & Project Rules

## Project Summary

**Team:** Team Vexora  
**Event:** DevHack 2026  
**Problem Statement:** PS 2.2, Context-Aware Data Privacy under Responsible AI  

### The Problem
Users frequently paste customer conversations, financial statements, medical records, and proprietary business documents into public AI chat interfaces and APIs. These prompts can contain names, phone numbers, identifiers, account details, and combinations of quasi-identifiers that inadvertently expose personal or corporate data. Simple keyword- or regex-based redaction tools fail on indirect, combined, or contextual risks, while aggressively destroying benign text necessary for AI utility.

### The Solution
**VeilGuard AI** is a context-aware privacy firewall for AI tools. It operates between the user and AI endpoints to intercept submissions, evaluate context-dependent privacy risks, enforce deterministic policy actions (allow, redact, require approval, block), generate utility-preserving pseudonymized prompts, require explicit human confirmation, and record strictly metadata-only audit logs.

---

## Project Rules & Invariants

### Honesty
1. **Never fabricate benchmark numbers, test results, completed features, customer demand, or security guarantees.** Any number presented in documentation, user interfaces, or presentation decks must originate directly from reproducible execution artifacts (e.g., in `bench/results/`).
2. **Status discipline:** Every feature is in exactly one of three states: **Implemented** (verified with passing automated tests or recorded manual run), **Planned**, or **Future**. `docs/STATUS.md` is the single source of truth and must be updated in the same commit that modifies feature status.
3. **Never claim complete protection.** Known limitations are maintained in `docs/LIMITATIONS.md` and must be exposed clearly to users. If protection cannot be verified or guaranteed for a submission vector, the UI must prominently declare protection inactive or unverified.
4. **Transparent verification:** If a capability cannot be verified under current environment conditions, declare the limitation plainly rather than implying functionality.

### Security and Privacy Invariants
5. **Loopback binding only:** The local Python engine must bind strictly to `127.0.0.1`, never `0.0.0.0`.
6. **Fail closed:** If the local engine is unreachable, down, or returning errors, the extension must warn or block submission, never silently allow uninspected data to pass.
7. **No raw content persistence:** Raw prompt, document, or conversational text must never be written to disk, persistent logs, telemetry, or dashboard storage by default. Audit logs must record metadata only: category, entity count, risk score, decision, rule IDs, and timestamp.
8. **Zero external telemetry:** No network requests carrying user content or prompt data may leave the local boundary. Any future remote API integration must be fully documented and require explicit user consent.
9. **Least privilege permissions:** Do not request `<all_urls>` or excessive broad host permissions in `manifest.json`. Extension host permissions are scoped exclusively to the local mock site and target AI hosts.
10. **Synthetic data exclusively:** All tests, fixtures, demos, and sample documents must use strictly synthetic data. Never use real personal data. All test fixtures must be explicitly labeled as synthetic.
11. **Secret hygiene:** Never commit secrets, API keys, or tokens. `.env` and environment overrides must remain gitignored.

### Engineering Conventions
12. **Strict typing:**
    - Python: Type annotations throughout, validated models using Pydantic, and automated test coverage via `pytest`.
    - TypeScript: Strict type checking enabled (`strict: true`), with no implicit `any`. Any explicit `any` requires an inline comment detailing why it is unavoidable.
13. **Test-first behavior changes:** Every behavioral modification must ship with an automated test. Detection and policy rule modifications must follow test-driven practices.
14. **Deterministic core:** Core privacy detection, context scoring, and policy evaluation must be deterministic and rule-based. LLMs may be utilized as optional assistive enhancers in future phases, but the critical protection path must never depend on non-deterministic LLM availability.
15. **Centralized adapter configuration:** Site-specific selectors, DOM interaction quirks, and target mutations must reside in structured adapter configuration files, not scattered across content scripts.
16. **Self-documenting code:** Code comments should articulate *why* a specific decision was made, rather than repeating *what* the syntax does. Minimize third-party dependencies.
17. **Conventional commits:** Commit history must use Conventional Commits format (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

### Workflow Discipline
18. **Phase boundary enforcement:** Work strictly one phase at a time. Do not build ahead of the active phase scope. A phase is complete only when all acceptance criteria and "done when" verifications pass with tangible output.
19. **Session initialization:** At the start of each work session, consult `AGENTS.md`, `docs/STATUS.md`, and `docs/PHASES.md`.
20. **Security escalation:** When any security- or privacy-relevant design choice is ambiguous, halt and solicit clarification rather than making unverified assumptions.
21. **Workspace containment:** Confine all file modifications, script executions, and package installations to the project workspace directory. Do not perform destructive actions or modify global system packages.

### Live Third-Party Site Testing Rules (Phase 4)
22. **Never send anything to the provider during automated trials:** All requests to the chat endpoint are intercepted in Playwright with `page.route`, recorded, and fulfilled with a stub response. Nothing the harness types ever reaches the provider's servers. (All test text is synthetic regardless.)
23. **No evasion:** Do not use stealth plugins, spoofed fingerprints, CAPTCHA solvers, or any technique to defeat bot detection or terms of service. If the site blocks automated browsers, shows a challenge you cannot pass normally, or restricts automation in its terms, stop and report. Do not improvise a workaround.
24. **Credentials are the human's:** If login is needed, the human logs in manually in a dedicated browser profile (`.playwright-real-profile/`, gitignored). The agent never sees, types, stores or logs credentials. Never commit the profile directory.
25. **Respect the site:** Low request volume, no scraping, no bulk page loads. Check the site's terms and robots statements about automated access and summarize findings in `docs/SITE_SURVEY.md`.
26. **Real-site tests are opt-in:** They run only with `VG_REAL_SITE=1`, live in `tests/e2e-real/`, and are excluded from `npm run test:e2e` and from CI.
27. **Verify, don't assume:** Confirm all DOM details and request formats against the live site and record the verification date.

