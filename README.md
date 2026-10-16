# VeilGuard AI: Context-Aware Privacy Firewall for AI Tools

> **Project Status:** **Phase 1 complete (multi-layer submission interception verified on mock site: 480 trials across 12 cells, with no leaks observed across 240 flagged trials). Phase 2 complete (detection engine & secured /scan API verified: 34 tests pass, 3 xfail). Phase 3a (policy engine & sanitizer) in progress.**

VeilGuard AI is a context-aware privacy firewall designed to sit between users and AI interfaces. When users paste sensitive data—such as customer conversations, financial records, medical notes, or system secrets—VeilGuard intercepts submissions, evaluates context and task necessity, enforces configurable privacy policies, produces utility-preserving pseudonymized prompts, and records metadata-only audit logs.

- **Team:** Team Vexora
- **Event:** DevHack 2026
- **Problem Statement:** PS 2.2, Context-Aware Data Privacy under Responsible AI

---

## Prerequisites

- **Node.js:** v20.x or higher (v24.x supported) & npm
- **Python:** Python 3.11, 3.12, or 3.13 (64-bit)
- **Git**
- **Google Chrome** or Chromium-based browser (for extension execution)

---

## Quickstart & Setup

### 1. Repository Setup

Clone or enter the project repository:
```bash
git clone <repo-url>
cd DevHost_2026
```

### 2. Python Engine Setup

#### On Windows (PowerShell):
```powershell
# Create virtual environment
py -3.13 -m venv .venv
# Or: python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Upgrade pip and install dependencies
python -m pip install --upgrade pip
pip install -r engine/requirements.txt -r engine/requirements-dev.txt

# Download required spaCy NLP model
python -m spacy download en_core_web_sm
```

#### On macOS / Linux:
```bash
# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
source .venv/bin/activate

# Upgrade pip and install dependencies
python -m pip install --upgrade pip
pip install -r engine/requirements.txt -r engine/requirements-dev.txt

# Download required spaCy NLP model
python -m spacy download en_core_web_sm
```

### 3. Extension & Frontend Tooling Setup

Install root Node dependencies and Playwright test browsers:
```bash
npm install
npx playwright install chromium
```

---

## Running the Components

### 1. Start the Local Python Engine
The engine must strictly bind to loopback (`127.0.0.1:8765`):
```bash
python -m veilguard_engine
```

Verify the engine health endpoint:
- **Windows PowerShell:**
  ```powershell
  Invoke-RestMethod http://127.0.0.1:8765/health
  # Returns: @{status=ok; version=0.0.1}
  ```
- **macOS / Linux / bash:**
  ```bash
  curl http://127.0.0.1:8765/health
  # Returns: {"status":"ok","version":"0.0.1"}
  ```

### 2. Build the Extension
```bash
npm run build
```
The compiled, production-ready extension artifacts will be located in `extension/dist/`.

### 3. Load the Extension in Google Chrome
1. Navigate to `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (toggle in top-right corner).
3. Click **Load unpacked**.
4. Select the `extension/dist/` folder from this repository.
5. Click the VeilGuard AI extension icon in your browser toolbar. The popup will display the Phase 0 notice: **"Protection inactive"**.

---

## Testing

Run each test suite using the commands below:

### 1. Python Engine Smoke Tests (`pytest`)
From the repository root with `.venv` activated:
```bash
pytest
```
Verifies loopback binding (`127.0.0.1`), FastAPI `/health` endpoint, spaCy `en_core_web_sm` loading, Presidio Analyzer instantiation, and PyMuPDF PDF generation/extraction.

### 2. TypeScript Static Typecheck
```bash
npm run typecheck
```
Executes `tsc --noEmit` under strict typing rules (`strict: true`, `noImplicitAny: true`).

### 3. Extension End-to-End Test (`Playwright`)
```bash
npm run test:e2e
```
Launches Chromium with the built extension loaded, detects the background service worker, navigates to `popup.html`, and verifies that "Protection inactive" is honestly rendered.

---

## Folder Layout

```
veilguard/
  AGENTS.md                  # Project rules, invariants, and guidelines
  README.md                  # Project overview, setup, and testing documentation
  package.json               # Root Node package configuration and test scripts
  playwright.config.ts       # Playwright E2E test configuration
  pytest.ini                 # Pytest configuration
  .github/workflows/ci.yml   # Continuous integration workflow definition
  docs/
    ARCHITECTURE.md          # Target architecture specification (design only)
    STATUS.md                # Single source of truth for feature implementation status
    LIMITATIONS.md           # Transparent declaration of boundaries and limitations
    DECISIONS.md             # Technical and architectural decisions log
    PHASES.md                # Complete project roadmap across Phases 0 through 8
  extension/
    manifest.json            # Chrome MV3 extension manifest
    options.html, popup.html # Extension page entry points
    vite.config.ts, tsconfig.json
    src/
      background/            # Service worker (Phase 0: lifecycle logging only)
      popup/                 # Action popup React app ("Protection inactive")
      options/               # Dashboard React app (metadata-only audit view)
      content/               # Content script (IIFE bundle; unregistered in Phase 0)
      page-world/            # MAIN-world fetch backstop (IIFE; unregistered in Phase 0)
      shared/                # Common types and constants
  engine/
    requirements.txt         # Pinned engine dependencies
    requirements-dev.txt     # Test dependencies
    veilguard_engine/
      __init__.py, __main__.py
      config.py              # Host (127.0.0.1) and Port (8765) configuration
      server.py              # FastAPI app with /health endpoint
      detectors/             # Placeholder for Presidio, custom validators, secrets
      context/               # Placeholder for context feature extraction
      necessity/             # Placeholder for task intent & necessity matrices
      reid/                  # Placeholder for quasi-identifier re-ID risk scorer
      policy/                # Placeholder for declarative YAML policy engine
      sanitizer/             # Placeholder for utility-preserving pseudonymization
      vault/                 # Placeholder for reversible pseudonym store
      pdf/                   # Placeholder for PyMuPDF vector/raster redaction
  policies/                  # Placeholder for policy YAML files
  bench/                     # Placeholder for reproducible evaluation harness & datasets
  mock-ai-site/              # Placeholder for deterministic mock AI chat testbed
  scripts/
    build-extension.mjs      # Plain Vite multi-stage build script
  tests/
    engine/                  # Automated pytest smoke tests
    e2e/                     # Automated Playwright extension tests
```

---

## Documentation Links

- [Project Guidelines & Rules (AGENTS.md)](./AGENTS.md)
- [Target Architecture](./docs/ARCHITECTURE.md)
- [Implementation Status Matrix](./docs/STATUS.md)
- [Known Limitations](./docs/LIMITATIONS.md)
- [Architecture & Decisions Log](./docs/DECISIONS.md)
- [Phase Roadmap (Phases 0–8)](./docs/PHASES.md)
