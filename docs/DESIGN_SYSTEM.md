# VeilGuard AI: Design System & UI Guidelines

VeilGuard AI is engineered for high trust, rapid situational awareness, and friction-free privacy guardrails. Its visual language bridges modern cybersecurity telemetry with clean, approachable ergonomics for everyday AI power users.

---

## 1. Visual Foundation & Color Palette

The interface uses a dark mode primary foundation with high-contrast functional color accents to communicate safety levels instantaneously.

### Background & Surface Tones
| Token | Hex Value | Usage |
| :--- | :--- | :--- |
| `surface-background` | `#0b0f17` | Deep space canvas, root body background |
| `surface-card` | `#0f172a` | Primary card panels, popup containers, sidebar body |
| `surface-overlay` | `#1e293b` | Review modal containers, hover surfaces, dropdown menus |
| `surface-border` | `#334155` | Subtle container dividing borders, card strokes |

### Brand & Accent Tones
| Token | Hex Value | Usage |
| :--- | :--- | :--- |
| `brand-cyan` | `#06b6d4` | Primary brand accent, glow highlights, active toggles |
| `brand-teal` | `#14b8a6` | Secondary accent, safe state highlights |
| `brand-indigo` | `#6366f1` | Neutral control buttons, secondary badges |
| `brand-violet` | `#8b5cf6` | Synthetic pseudonym entity tags, vault badges |

### Status & Risk Tones
| Status | Hex Value | Meaning & Context |
| :--- | :--- | :--- |
| `risk-low` / `allow` | `#10b981` (Emerald) | Safe to submit; no sensitive PII/secrets discovered. |
| `risk-medium` / `redact` | `#f59e0b` (Amber) | PII or corporate quasi-identifiers detected; pseudonymized diff ready. |
| `risk-high` / `block` | `#ef4444` (Rose) | Critical secrets, credentials, or protected financial data violating policy. |
| `status-offline` | `#6b7280` (Gray) | Local engine unreachable or connection pending. |

---

## 2. Typography

VeilGuard utilizes a clean dual-font typographic hierarchy designed for legibility at small sizes inside extension overlays and desktop sidebars.

- **Interface Font**: System Sans-Serif stack (`Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Roboto`, `sans-serif`).
  - Weights: Regular (400) for body text and tooltips; Medium (500) for labels and controls; Semibold (600) for section titles and modal headers.
- **Data & Telemetry Font**: Monospace stack (`"JetBrains Mono"`, `"Fira Code"`, `Consolas`, `monospace`).
  - Weights: Regular (400) for diff views, pseudonym values, rule IDs, and audit hash tokens.

---

## 3. Core UI Components

### 3.1 In-Context Review Modal (Extension)
- **Glassmorphic Backing**: `backdrop-blur-md` with `rgba(15, 23, 42, 0.85)` background and a fine 1px border (`rgba(255, 255, 255, 0.1)`).
- **Header**: Displays risk score badge, targeted destination domain, and matched policy level.
- **Interactive Diff Component**: Split or unified side-by-side view highlighting removed tokens in muted red (`bg-rose-950/40 text-rose-300`) and substituted pseudonyms in muted cyan/purple (`bg-cyan-950/40 text-cyan-300`).
- **Entity Chip Grid**: Pill-style chips displaying detected entity types (`[PERSON: 2]`, `[CREDIT_CARD: 1]`) with interactive toggle switches.
- **Actions Bar**: Primary call-to-action button ("Approve & Send") with keyboard focus and secondary "Dismiss / Edit" option.

### 3.2 Floating Sidebar (Desktop Application)
- **Docking Behavior**: Aligns framelessly to the right edge of the primary monitor (`screen_width - 380px`, full height).
- **Edge Accent**: A 2px neon cyan vertical border on the left boundary indicates active guard mode.
- **Top Bar**: Minimalist system control buttons (minimize, pin-to-top, engine health pill, settings gear).
- **Quick Scrub Pad**: Paste textarea with live character/token counter, real-time risk assessment meter, and a 1-click "Sanitize & Copy" button.

### 3.3 Web Demo PDF Sanitizer
- **Drag-and-Drop Zone**: Dashed border with responsive upload state transitions.
- **Dual Sample Previews**: Pre-loaded synthetic sample files for 1-click evaluation without requiring user file upload.
- **Live Stream Inspection**: Visual progress indicator showing text extraction, entity detection, token replacement, and binary PDF compilation.

---

## 4. Accessibility & Human Factors

1. **Explicit Confirmation**: The user is always in control. Automated redaction never fires blindly into target AI web forms without user approval (or explicit policy rule setting).
2. **Keyboard Ergonomics**:
   - `Enter` / `Ctrl + Enter`: Submit and approve sanitized prompt.
   - `Esc`: Close review modal and return focus to host application.
   - `Tab`: Sequential navigation constrained within the modal boundaries (focus trap).
3. **High-Contrast Text**: Text contrast ratios meet or exceed WCAG AA standards (minimum 4.5:1 for standard body text against dark backgrounds).
4. **Honest System Status**: When the local engine is disconnected, the UI displays an unambiguous gray/amber banner declaring "Engine Unreachable — Fail Closed Active" rather than silent fallback.
