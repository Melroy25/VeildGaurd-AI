# VeilGuard AI: Architecture & Engineering Decisions Log

This document records key technical decisions, rationales, and alternatives evaluated throughout development.

---

## Decision Log

### 1. Plain Vite Build Pipeline for Chrome Extension
- **Date:** Phase 0
- **Context:** Chrome MV3 requires content scripts and MAIN-world scripts to be standalone, self-contained IIFE (Immediately Invoked Function Expression) bundles without ES-module `import` statements at runtime. Meanwhile, the popup and options dashboard utilize React with HTML entry points.
- **Decision:** Use official Vite and `@vitejs/plugin-react` coordinated via a custom node build script (`scripts/build-extension.mjs`) executing separate Vite programmatic builds (one multi-page build for popup, options, and service worker; separate IIFE library builds for content and page-world scripts).
- **Rationale:** Avoids third-party opinionated MV3 wrapper plugins (e.g., `@crxjs/vite-plugin` or Webpack CRX plugins) which frequently break across Vite updates or introduce opaque runtime loaders. Keeps the entire build transparent and maintainable.

### 2. Exclusion of Playwright from Default CI Pipeline
- **Date:** Phase 0
- **Context:** Automated CI runs on GitHub Actions for every pull request and push.
- **Decision:** Configure `.github/workflows/ci.yml` to run Python lint/pytest and TypeScript typecheck/build, but run Playwright end-to-end tests locally or on-demand rather than on every basic CI run.
- **Rationale:** Playwright extension testing requires full Chromium browser binary installation, custom flags (`--load-extension`, `--disable-extensions-except`), and virtual displays in headless Linux CI environments. Retaining Playwright for local gate verification and staging runs prevents slow and flaky standard CI runs while still providing 100% automated local verification.

### 3. Engine Host and Port Binding
- **Date:** Phase 0
- **Context:** The local Python privacy engine must only serve local browser requests.
- **Decision:** Hardcode loopback binding to `HOST = "127.0.0.1"` and `PORT = 8765` in `engine/veilguard_engine/config.py`. Assert this binding explicitly in automated unit tests.
- **Rationale:** Enforces Security Rule 5: never bind to `0.0.0.0` or expose privacy inspection endpoints to the local area network.

### 4. Shadow DOM for Extension UI Components
- **Date:** Phase 0 (Architecture specification)
- **Context:** The review overlay must render on top of arbitrary AI host websites (ChatGPT, Claude, etc.) without having its styles overridden by host stylesheets or inadvertently leaking styles into the host page.
- **Decision:** Encapsulate all injected review overlay UI within an isolated Shadow DOM.
- **Rationale:** Complete style encapsulation and immunity to host page CSS resets or styling collisions.

### 5. Python Environment Selection
- **Date:** Phase 0
- **Context:** Prompt specifies Python 3.11 or 3.12. Host machine environment contains Python 3.14, Python 3.13.5, and Python 3.10. Python 3.11 and 3.12 are not present on the host system.
- **Decision:** Utilize Python 3.13.5 to create the virtual environment `.venv`. If any package (Presidio, spaCy, PyMuPDF) encounters wheel or build incompatibilities on 3.13, evaluate Python 3.10 or report exact errors as instructed.
- **Rationale:** Python 3.13 provides modern typing and performance while spaCy v3.8+ and PyMuPDF provide verified pre-built wheels for Python 3.13 on Windows x64.
