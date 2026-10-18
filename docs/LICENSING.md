# VeilGuard AI: Licensing & Legal Analysis

## 1. Project License Decision Notice
The root `LICENSE` file for VeilGuard AI is deliberately left for the human team and repository owner to select. This document lays out the factual runtime dependency licenses, legal considerations, and available options.

---

## 2. Critical Copyleft Dependencies

Two components utilized in the VeilGuard architecture carry copyleft obligations that impact the distribution of compiled binaries (such as the Windows installer):

### A. PyMuPDF (`fitz`) — **GNU Affero GPL v3.0 (AGPL-3.0)**
- **Role:** In-memory PDF redaction, vector glyph removal, and text rendering.
- **License:** Dual-licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** or commercial license from Artifex Software.
- **Implication:**
  - AGPL-3.0 is a strong copyleft license. If compiled or statically bundled into a single distributed binary (e.g., via PyInstaller), the entire binary and derivative work must typically be licensed under an AGPL-3.0 compatible license, and source code must be made available.
  - Using PyMuPDF in pure local source code form (where users clone the repo and install via `pip`) is permissible under AGPL, but distributing pre-packaged closed or permissive binary installers requires compliance with AGPL terms.

### B. `pystray` — **GNU Lesser General Public License v3.0 (LGPL-3.0)**
- **Role:** Windows System Tray notification daemon (Part 4).
- **License:** **LGPL-3.0**.
- **Implication:**
  - LGPL allows linking as a shared library, provided users have the ability to re-link or replace the LGPL component.
  - A PyInstaller `--one-directory` distribution keeps Python packages dynamically loaded (supporting LGPL replacement requirements), whereas a monolithic `--onefile` binary merges all code into a single executable, complicating LGPL compliance unless the whole work is LGPL/GPL.

---

## 3. Options for the Human Team

The team must choose one of the following licensing paths before publishing or distributing releases:

### Option 1: License the Project as AGPL-3.0 (Recommended for Open Source AI Safety)
- **Action:** Add `LICENSE` containing the full GNU Affero General Public License v3.0 text.
- **Advantages:** 100% compliant with PyMuPDF and `pystray`. Ensures derivative versions remain open source. Strong alignment with responsible AI and transparent safety tooling.
- **Trade-offs:** Proprietary commercial redistribution of the monolithic bundle without open-sourcing is prohibited unless Artifex commercial licenses are acquired.

### Option 2: Apache-2.0 or MIT with Standalone PDF Subprocess / Modular Plugin Architecture
- **Action:** License VeilGuard under Apache-2.0 or MIT, but isolate PyMuPDF into an optional, modular plugin or standalone subprocess rather than linking directly in the core package.
- **Advantages:** Maximum permissive reuse of the core browser extension and rule engine.
- **Trade-offs:** Requires refactoring the PDF redaction engine into a separate optional package and instructing users to install it independently.

### Option 3: Replace PyMuPDF with a Permissive PDF Engine
- **Action:** Replace PyMuPDF with `pypdf` + `pdfminer.six` (BSD / MIT).
- **Advantages:** Pure permissive licensing across the board.
- **Trade-offs:** PyMuPDF is currently the industry gold standard for vector glyph stream destruction and redaction annotation rendering. Standard `pypdf` lacks native vector stream wiping capabilities without complex custom stream rewrites.

---

## 4. Runtime Dependency License Summary

| Package | Ecosystem | License | Copyleft Type |
| :--- | :--- | :--- | :--- |
| `fastapi` | Python | MIT | Permissive |
| `uvicorn` | Python | BSD-3-Clause | Permissive |
| `pydantic` | Python | MIT | Permissive |
| `presidio-analyzer` | Python | MIT | Permissive |
| `presidio-anonymizer` | Python | MIT | Permissive |
| `spacy` | Python | MIT | Permissive |
| `pymupdf` | Python | **AGPL-3.0** | **Strong Copyleft** |
| `pypdf` | Python | BSD-3-Clause | Permissive |
| `pyyaml` | Python | MIT | Permissive |
| `pystray` | Python | **LGPL-3.0** | **Weak Copyleft** |
| `pillow` | Python | HPND | Permissive |
| `react` & `react-dom` | Node | MIT | Permissive |
| `vite` | Node | MIT | Permissive |
| `tailwindcss` | Node | MIT | Permissive |
