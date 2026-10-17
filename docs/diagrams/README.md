# VeilGuard AI: Architecture & Flow Diagrams

This directory contains pure Mermaid (`.mmd`) specifications illustrating the architectural topology, runtime request interception lifecycle, and multi-stage decision pipeline of VeilGuard AI.

## Diagram Index

1. **[architecture.mmd](./architecture.mmd)**:
   - System topology detailing the Chrome Extension (Content Script, Shadow DOM Overlay, Session Vault, Main-World Fetch Backstop, Canary Monitor, Dashboard UI), the local Python engine (`127.0.0.1:8765`), detection/intelligence modules, and external AI provider boundaries.
2. **[request-flow.mmd](./request-flow.mmd)**:
   - Runtime sequence diagram showing the capture-phase DOM submission interception, asynchronous engine analysis, review overlay interaction, vault pseudonymization, and dual-layer fetch backstop validation.
3. **[decision-flow.mmd](./decision-flow.mmd)**:
   - Detailed multi-stage flowchart tracing a prompt through entity detection, task intent inference, quasi-identifier combination risk calculation, declarative policy evaluation (`allow`, `redact`, `require_approval`, `block`), sanitization, and user confirmation.

## How to Render

- **GitHub / GitLab Markdown:** Embed directly in markdown files using ` ```mermaid ` code fences.
- **Mermaid Live Editor:** Open [mermaid.live](https://mermaid.live) and paste the file contents directly.
- **VS Code Extension:** Install the "Markdown Preview Mermaid Support" or "Mermaid Previewer" extension to preview inline.
- **Command Line (Mermaid CLI):**
  ```bash
  npx @mermaid-js/mermaid-cli -i docs/diagrams/architecture.mmd -o docs/diagrams/architecture.png
  ```
