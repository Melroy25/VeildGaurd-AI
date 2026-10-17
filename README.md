# VeilGuard AI: Context-Aware Privacy Firewall for AI Tools

> **Project Status:** **Phase 1 complete (mock-site testbed), Phase 2 complete (detection engine & /scan API), Phase 3a complete (policy engine & sanitizer), Phase 3b complete (extension + engine integration, review overlay, session vault, 14-cell enforcement matrix), Phase 3c complete (metadata dashboard, popup status, export, pause switch).**

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
  # Returns: {"status":"ok","version":"0.1.0"}
  ```

Verify authenticated `/analyze` endpoint:
- **Windows PowerShell:**
  ```powershell
  $token = Get-Content .veilguard/token
  $headers = @{
      "Authorization" = "Bearer $token"
      "Content-Type" = "application/json"
  }
  $body = @{
      text = "Analyze customer Rahul Sharma's account, phone number 9876543210."
      profile = "company"
  } | ConvertTo-Json
  Invoke-RestMethod -Uri http://127.0.0.1:8765/analyze -Method Post -Headers $headers -Body $body
  ```
- **macOS / Linux / bash:**
  ```bash
  TOKEN=$(cat .veilguard/token)
  curl -X POST http://127.0.0.1:8765/analyze \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"text": "Analyze customer Rahul Sharma'\''s account, phone number 9876543210.", "profile": "company"}'
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
5. Click the VeilGuard AI extension icon in your browser toolbar to view the **Popup Status UI**.

---

## Using the Privacy Dashboard & Popup (Phase 3c)

### Opening the Popup Status
- Click the VeilGuard AI extension icon in the toolbar.
- The popup displays:
  - **Engine Status:** Connected (v0.0.1) or Unreachable (with blocking warning).
  - **Active Profile:** Current policy profile (e.g. `company`).
  - **Today's Activity:** Messages checked, sanitized, and blocked today.
  - **This Page Protection:** Shows `Protected` on supported AI sites or `Not active on this site` on unsupported pages.
  - **Open Dashboard Button:** One click opens the full metadata dashboard in a new tab.

### Opening the Privacy Dashboard
- Either click **"Open Dashboard"** in the popup, or right-click the extension icon and select **"Options"**.
- The dashboard is **strictly metadata-only** (Rule 7): zero prompt text, entity values, or bearer tokens are stored or rendered.

### Dashboard Panels & Controls
1. **Summary Cards:** Messages checked, sent unchanged, sent sanitized, blocked/cancelled, engine fail-closed, and documents scanned (0 until Phase 7).
2. **Decision Tiers:** Bar chart showing policy decisions (`allow`, `redact`, `require_approval`, `block`). Labeled by plain-language meaning, not synthetic risk scores.
3. **User Actions:** Distribution of choices made on the review overlay (`sent_sanitized`, `sent_original`, `edited`, `cancelled`, `auto_allowed`).
4. **Sensitive Information by Category:** Cumulative entity counts across categories (PII, GOVERNMENT_ID, FINANCIAL, SECRET).
5. **Rules That Fired:** Frequency and plain-language explanations of triggered policy rules fetched live from the engine.
6. **Activity — Last 14 Days:** Daily volume histogram in local calendar dates.
7. **Observed Engine Latency:** Median and 95th-percentile engine analysis round-trip times observed on this device.
8. **Time Range & Facet Filters:** Filter events by 24h, 7d, 30d, all time, destination, profile, and decision.
9. **Pause Recording Switch:** Temporarily pauses event logging. **Protection and interception remain 100% active while paused.**
10. **Export & Clear:**
    - **JSON / CSV Export:** Downloads client-side files containing only whitelisted metadata fields.
    - **Clear History:** Two-click confirmation to permanently wipe stored audit events.

---

## Testing

Run each test suite using the commands below:

### 1. Fast Pure Unit Tests (`vitest`)
```bash
npm run test:unit
```
Runs 28 in-memory tests covering data aggregation, percentiles, whitelisting, write queues, and retention limits in ~200ms without browser overhead.

### 2. Python Engine Test Suite (`pytest`)
From the repository root with `.venv` activated:
```bash
pytest -rx
```
Runs 80 tests (76 passing, 4 strict xfail documenting known statistical NER and medical boundaries).

### 3. TypeScript Static Typecheck
```bash
npm run typecheck
```
Executes `tsc --noEmit` under strict typing rules (`strict: true`, `noImplicitAny: true`).

### 4. Extension End-to-End Test Suite (`Playwright`)
```bash
npm run test:e2e
```
Runs the full end-to-end browser test suites against the real Python loopback engine and mock testbed:
- `tests/e2e/dashboard-popup.spec.ts` (36 tests): Dashboard rendering, filtering, export, privacy assertions, popup statuses, 1000-event render benchmark, and offline CSP compliance.
- `tests/e2e/enforcement-full-chain.spec.ts`: Full-chain 14-cell enforcement matrix across all composers, wirings, and paths.
- `tests/e2e/scenarios.spec.ts`: 15 comprehensive edge-case scenarios (approval, block, double Enter, emoji, XSS, backstop, vault consistency).

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
