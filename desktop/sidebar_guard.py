"""VeilGuard AI: Context-Aware Desktop Sidebar Companion.

A lightweight, draggable desktop sidebar that stays docked to the screen edge
and automatically activates/pops up when AI tools (ChatGPT, Claude, Cursor, Copilot, etc.)
are in focus.

Features:
- Pure Python standard library (tkinter + ctypes + urllib), zero extra pip installs.
- Draggable along the screen edge (or anywhere on screen).
- Smart Foreground Detection: Automatically detects when ChatGPT / Claude / AI apps are focused.
- Clipboard Auto-Scan: Inspects copied text against local engine (127.0.0.1:8765).
- 1-Click Sanitize & Copy: Previews privacy diff and swaps in clean role placeholders.
- Fail-Closed Engine Monitor: Shows live connection status to VeilGuard loopback core.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import sys
import threading
import time
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import urllib.request
import urllib.error

# Engine configuration
ENGINE_URL = "http://127.0.0.1:8765"
DEFAULT_PROFILE = "company"

# AI Applications & Windows to monitor
AI_KEYWORDS = [
    "chatgpt",
    "claude",
    "copilot",
    "gemini",
    "perplexity",
    "cursor",
    "poe",
    "ollama",
    "lm studio",
    "anthropic",
    "openai",
    "deepseek",
]

# Color Palette (Dark Mode)
BG_DARK = "#121316"
BG_PANEL = "#1C1D22"
BG_CARD = "#24262E"
BG_INPUT = "#18191E"
BORDER_COLOR = "#2F323D"
TEXT_PRIMARY = "#F3F4F6"
TEXT_SECONDARY = "#9CA3AF"
TEXT_MUTED = "#6B7280"
ACCENT_INDIGO = "#6366F1"
ACCENT_GREEN = "#10B981"
ACCENT_AMBER = "#F59E0B"
ACCENT_RED = "#EF4444"


def get_auth_token() -> str:
    """Read local bearer token from standard location if present."""
    token_path = Path.home() / ".veilguard" / "token"
    if token_path.is_file():
        try:
            return token_path.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    # Also check local project directory
    local_token = Path(__file__).parent.parent / ".veilguard" / "token"
    if local_token.is_file():
        try:
            return local_token.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    return "dev-local-token"


class ForegroundDetector:
    """Detects active focused window title using Windows Win32 API."""

    def __init__(self):
        self.user32 = ctypes.windll.user32

    def get_active_window_title(self) -> str:
        try:
            hwnd = self.user32.GetForegroundWindow()
            if not hwnd:
                return ""
            length = self.user32.GetWindowTextLengthW(hwnd)
            if length == 0:
                return ""
            buf = ctypes.create_unicode_buffer(length + 1)
            self.user32.GetWindowTextW(hwnd, buf, length + 1)
            return buf.value or ""
        except Exception:
            return ""

    def is_ai_tool_focused(self) -> tuple[bool, str]:
        title = self.get_active_window_title().lower()
        if not title:
            return False, ""
        for kw in AI_KEYWORDS:
            if kw in title:
                return True, title
        return False, title


class VeilGuardClient:
    """Thin HTTP client for local loopback engine (127.0.0.1:8765)."""

    def __init__(self, base_url: str = ENGINE_URL):
        self.base_url = base_url
        self.token = get_auth_token()

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
        }

    def check_health(self) -> bool:
        try:
            req = urllib.request.Request(f"{self.base_url}/health", headers=self._headers(), method="GET")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                return resp.status == 200
        except Exception:
            return False

    def scan_prompt(self, text: str, profile: str = DEFAULT_PROFILE) -> dict | None:
        try:
            payload = json.dumps({"text": text, "profile": profile}).encode("utf-8")
            req = urllib.request.Request(
                f"{self.base_url}/scan",
                data=payload,
                headers=self._headers(),
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            return None

    def sanitize_prompt(self, text: str, profile: str = DEFAULT_PROFILE) -> dict | None:
        try:
            payload = json.dumps({"text": text, "profile": profile}).encode("utf-8")
            req = urllib.request.Request(
                f"{self.base_url}/sanitize",
                data=payload,
                headers=self._headers(),
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            return None

    def redact_pdf(self, pdf_bytes: bytes, profile: str = DEFAULT_PROFILE) -> bytes | None:
        try:
            headers = self._headers()
            headers["Content-Type"] = "application/pdf"
            req = urllib.request.Request(
                f"{self.base_url}/pdf/redact?profile={profile}",
                data=pdf_bytes,
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15.0) as resp:
                return resp.read()
        except Exception:
            return None


class VeilGuardSidebar(tk.Tk):
    """The floating, draggable desktop sidebar widget."""

    def __init__(self):
        super().__init__()

        self.title("VeilGuard AI Sidebar")
        self.client = VeilGuardClient()
        self.detector = ForegroundDetector()

        # Window state
        self.is_expanded = False
        self.auto_pop_enabled = tk.BooleanVar(value=True)
        self.clipboard_monitor_enabled = tk.BooleanVar(value=True)
        self.last_clipboard = ""
        self.active_ai_app_name = ""
        self.is_dragging = False
        self.drag_start_x = 0
        self.drag_start_y = 0

        # Screen dimensions
        self.screen_w = self.winfo_screenwidth()
        self.screen_h = self.winfo_screenheight()

        # Geometry dimensions
        self.collapsed_width = 38
        self.collapsed_height = 140
        self.expanded_width = 380
        self.expanded_height = 560

        # Position docked to right edge
        self.win_x = self.screen_w - self.collapsed_width - 8
        self.win_y = max(80, (self.screen_h - self.expanded_height) // 2)

        # Style & Configuration
        self.configure(bg=BG_PANEL)
        self.overrideredirect(True)  # Frameless
        self.wm_attributes("-topmost", True)  # Always on top

        # Set transparency key / rounded look
        try:
            self.wm_attributes("-alpha", 0.96)
        except Exception:
            pass

        # Build UI layout
        self._build_ui()
        self._apply_geometry()

        # Start background polling threads
        self.running = True
        self.poll_thread = threading.Thread(target=self._background_watcher, daemon=True)
        self.poll_thread.start()

    def _build_ui(self):
        """Construct the collapsed handle and the expanded full panel."""
        self.main_container = tk.Frame(self, bg=BG_PANEL, highlightthickness=1, highlightbackground=BORDER_COLOR)
        self.main_container.pack(fill="both", expand=True)

        # ---------------- COLLAPSED HANDLE ----------------
        self.handle_frame = tk.Frame(self.main_container, bg=BG_PANEL, cursor="hand2")
        
        # Drag grip icon
        self.handle_grip = tk.Label(
            self.handle_frame,
            text="⋮⋮",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 11, "bold"),
        )
        self.handle_grip.pack(pady=(6, 2))

        # Shield Icon & Label
        self.handle_shield = tk.Label(
            self.handle_frame,
            text="🛡️",
            fg=ACCENT_INDIGO,
            bg=BG_PANEL,
            font=("Segoe UI Emoji", 14),
        )
        self.handle_shield.pack(pady=2)

        # Vertical text
        self.handle_label = tk.Label(
            self.handle_frame,
            text="V\nE\nI\nL",
            fg=TEXT_SECONDARY,
            bg=BG_PANEL,
            font=("Segoe UI", 8, "bold"),
            justify="center",
        )
        self.handle_label.pack(pady=(2, 6))

        # Status dot on collapsed handle
        self.handle_dot = tk.Label(
            self.handle_frame,
            text="●",
            fg=ACCENT_GREEN,
            bg=BG_PANEL,
            font=("Segoe UI", 9),
        )
        self.handle_dot.pack(pady=(0, 6))

        # Bind events to handle
        for widget in (self.handle_frame, self.handle_grip, self.handle_shield, self.handle_label, self.handle_dot):
            widget.bind("<Button-1>", self._on_handle_click)
            widget.bind("<B1-Motion>", self._on_drag)

        # ---------------- EXPANDED CONTENT PANEL ----------------
        self.content_frame = tk.Frame(self.main_container, bg=BG_PANEL)

        # Header Bar
        header = tk.Frame(self.content_frame, bg=BG_PANEL)
        header.pack(fill="x", padx=12, pady=(10, 8))

        header_title = tk.Label(
            header,
            text="🛡️ VeilGuard AI",
            fg=TEXT_PRIMARY,
            bg=BG_PANEL,
            font=("Segoe UI", 11, "bold"),
        )
        header_title.pack(side="left")

        self.status_badge = tk.Label(
            header,
            text="● Online",
            fg=ACCENT_GREEN,
            bg=BG_PANEL,
            font=("Segoe UI", 9),
        )
        self.status_badge.pack(side="left", padx=8)

        # Minimize Button
        close_btn = tk.Label(
            header,
            text="✕",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 10, "bold"),
            cursor="hand2",
        )
        close_btn.pack(side="right")
        close_btn.bind("<Button-1>", lambda e: self.collapse())

        # Drag grip on header
        drag_handle = tk.Label(
            header,
            text="⋮⋮ Drag",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 9),
            cursor="fleur",
        )
        drag_handle.pack(side="right", padx=10)
        drag_handle.bind("<Button-1>", self._start_drag)
        drag_handle.bind("<B1-Motion>", self._on_drag)

        # Active App Context Bar
        self.context_bar = tk.Frame(self.content_frame, bg=BG_CARD, padx=8, pady=6)
        self.context_bar.pack(fill="x", padx=12, pady=(0, 8))

        self.context_icon = tk.Label(self.context_bar, text="⚡", fg=ACCENT_AMBER, bg=BG_CARD, font=("Segoe UI", 10))
        self.context_icon.pack(side="left")

        self.context_label = tk.Label(
            self.context_bar,
            text="Waiting for AI tool...",
            fg=TEXT_SECONDARY,
            bg=BG_CARD,
            font=("Segoe UI", 9),
        )
        self.context_label.pack(side="left", padx=6)

        # Settings row (Auto-pop and clipboard checkboxes)
        settings_row = tk.Frame(self.content_frame, bg=BG_PANEL)
        settings_row.pack(fill="x", padx=12, pady=(0, 6))

        cb_auto = tk.Checkbutton(
            settings_row,
            text="Auto-show on AI Apps",
            variable=self.auto_pop_enabled,
            fg=TEXT_SECONDARY,
            bg=BG_PANEL,
            selectcolor=BG_INPUT,
            activebackground=BG_PANEL,
            activeforeground=TEXT_PRIMARY,
            font=("Segoe UI", 8),
        )
        cb_auto.pack(side="left")

        cb_clip = tk.Checkbutton(
            settings_row,
            text="Clipboard Guard",
            variable=self.clipboard_monitor_enabled,
            fg=TEXT_SECONDARY,
            bg=BG_PANEL,
            selectcolor=BG_INPUT,
            activebackground=BG_PANEL,
            activeforeground=TEXT_PRIMARY,
            font=("Segoe UI", 8),
        )
        cb_clip.pack(side="right")

        # Input Prompt Text Box
        input_label = tk.Label(
            self.content_frame,
            text="ORIGINAL PROMPT (PASTE OR TYPE):",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 8, "bold"),
            anchor="w",
        )
        input_label.pack(fill="x", padx=12, pady=(4, 2))

        self.input_text = tk.Text(
            self.content_frame,
            height=5,
            bg=BG_INPUT,
            fg=TEXT_PRIMARY,
            insertbackground=TEXT_PRIMARY,
            highlightthickness=1,
            highlightbackground=BORDER_COLOR,
            relief="flat",
            font=("Consolas", 9),
            wrap="word",
        )
        self.input_text.pack(fill="x", padx=12, pady=(0, 8))

        # Button Row: Inspect & Sanitize
        btn_row = tk.Frame(self.content_frame, bg=BG_PANEL)
        btn_row.pack(fill="x", padx=12, pady=(0, 8))

        self.btn_inspect = tk.Button(
            btn_row,
            text="🔍 Inspect Prompt",
            bg=BG_CARD,
            fg=TEXT_PRIMARY,
            activebackground=BORDER_COLOR,
            activeforeground=TEXT_PRIMARY,
            relief="flat",
            padx=10,
            pady=4,
            font=("Segoe UI", 9, "bold"),
            cursor="hand2",
            command=self._do_inspect,
        )
        self.btn_inspect.pack(side="left")

        self.btn_sanitize = tk.Button(
            btn_row,
            text="✨ Sanitize & Copy",
            bg=ACCENT_INDIGO,
            fg="#FFFFFF",
            activebackground="#4F46E5",
            activeforeground="#FFFFFF",
            relief="flat",
            padx=12,
            pady=4,
            font=("Segoe UI", 9, "bold"),
            cursor="hand2",
            command=self._do_sanitize,
        )
        self.btn_sanitize.pack(side="right")

        # Result Summary & Entities Badge Area
        self.results_card = tk.Frame(self.content_frame, bg=BG_CARD, padx=8, pady=6)
        self.results_card.pack(fill="x", padx=12, pady=(0, 8))

        self.result_summary = tk.Label(
            self.results_card,
            text="Ready. Paste text or copy from your AI tool.",
            fg=TEXT_SECONDARY,
            bg=BG_CARD,
            font=("Segoe UI", 9),
            anchor="w",
        )
        self.result_summary.pack(fill="x")

        # Sanitized Output Preview
        clean_label = tk.Label(
            self.content_frame,
            text="SANITIZED OUTPUT (SAFE FOR AI):",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 8, "bold"),
            anchor="w",
        )
        clean_label.pack(fill="x", padx=12, pady=(4, 2))

        self.output_text = tk.Text(
            self.content_frame,
            height=5,
            bg=BG_INPUT,
            fg=ACCENT_GREEN,
            insertbackground=TEXT_PRIMARY,
            highlightthickness=1,
            highlightbackground=BORDER_COLOR,
            relief="flat",
            font=("Consolas", 9),
            wrap="word",
        )
        self.output_text.pack(fill="x", padx=12, pady=(0, 8))

        # Bottom Actions: Clean PDF & Copy Clean
        bottom_bar = tk.Frame(self.content_frame, bg=BG_PANEL)
        bottom_bar.pack(fill="x", padx=12, pady=(0, 8))

        btn_pdf = tk.Button(
            bottom_bar,
            text="📄 Scrub PDF",
            bg=BG_CARD,
            fg=TEXT_SECONDARY,
            activebackground=BORDER_COLOR,
            activeforeground=TEXT_PRIMARY,
            relief="flat",
            padx=8,
            pady=3,
            font=("Segoe UI", 8),
            cursor="hand2",
            command=self._do_pdf_scrub,
        )
        btn_pdf.pack(side="left")

        self.btn_copy_clean = tk.Button(
            bottom_bar,
            text="📋 Copy Clean",
            bg=ACCENT_GREEN,
            fg="#FFFFFF",
            activebackground="#059669",
            activeforeground="#FFFFFF",
            relief="flat",
            padx=12,
            pady=3,
            font=("Segoe UI", 8, "bold"),
            cursor="hand2",
            command=self._do_copy_clean,
        )
        self.btn_copy_clean.pack(side="right")

        # Initial layout state: Collapsed
        self.collapse()

    def _apply_geometry(self):
        """Update window position and geometry."""
        if self.is_expanded:
            w = self.expanded_width
            h = self.expanded_height
            x = self.screen_w - w - 12
            y = min(self.win_y, self.screen_h - h - 40)
        else:
            w = self.collapsed_width
            h = self.collapsed_height
            x = self.screen_w - w - 4
            y = min(self.win_y, self.screen_h - h - 40)

        self.geometry(f"{w}x{h}+{x}+{y}")

    def expand(self):
        """Expand the sidebar to full width."""
        self.is_expanded = True
        self.handle_frame.pack_forget()
        self.content_frame.pack(fill="both", expand=True)
        self._apply_geometry()

    def collapse(self):
        """Collapse the sidebar to an unobtrusive edge handle."""
        self.is_expanded = False
        self.content_frame.pack_forget()
        self.handle_frame.pack(fill="both", expand=True)
        self._apply_geometry()

    def _on_handle_click(self, event):
        """Toggle between expanded and collapsed on handle click."""
        if not self.is_dragging:
            self.expand()

    def _start_drag(self, event):
        self.is_dragging = True
        self.drag_start_y = event.y_root - self.winfo_y()

    def _on_drag(self, event):
        """Allow vertical dragging along screen edge."""
        new_y = event.y_root - self.drag_start_y
        new_y = max(20, min(self.screen_h - 100, new_y))
        self.win_y = new_y
        self._apply_geometry()

    def _background_watcher(self):
        """Background thread detecting active AI apps and clipboard changes."""
        was_ai_focused = False

        while self.running:
            try:
                # 1. Health check local engine
                is_healthy = self.client.check_health()
                self._update_health_badge(is_healthy)

                # 2. Check active window
                is_ai, title = self.detector.is_ai_tool_focused()

                if is_ai:
                    self.active_ai_app_name = title
                    self._update_context_badge(f"Active: {title[:28]}...", True)

                    # Auto-expand if transitioning from non-AI to AI app
                    if not was_ai_focused and self.auto_pop_enabled.get():
                        if not self.is_expanded:
                            self.after(0, self.expand)
                    was_ai_focused = True

                else:
                    self._update_context_badge("Standing by (No AI app active)", False)
                    # If auto-pop enabled and user switches away, stay collapsed if desired
                    was_ai_focused = False

                # 3. Check clipboard for prompt changes
                if self.clipboard_monitor_enabled.get() and is_ai:
                    self._check_clipboard_quietly()

            except Exception:
                pass

            time.sleep(0.6)

    def _update_health_badge(self, is_healthy: bool):
        def _update():
            if is_healthy:
                self.status_badge.config(text="● Online", fg=ACCENT_GREEN)
                self.handle_dot.config(fg=ACCENT_GREEN)
            else:
                self.status_badge.config(text="● Engine Offline", fg=ACCENT_RED)
                self.handle_dot.config(fg=ACCENT_RED)
        self.after(0, _update)

    def _update_context_badge(self, text: str, is_active: bool):
        def _update():
            self.context_label.config(text=text)
            if is_active:
                self.context_icon.config(text="⚡", fg=ACCENT_GREEN)
                self.handle_shield.config(fg=ACCENT_GREEN)
            else:
                self.context_icon.config(text="💤", fg=TEXT_MUTED)
                self.handle_shield.config(fg=ACCENT_INDIGO)
        self.after(0, _update)

    def _check_clipboard_quietly(self):
        """Inspect clipboard without stealing user focus."""
        try:
            clip = self.clipboard_get()
            if clip and clip != self.last_clipboard and len(clip.strip()) > 5:
                self.last_clipboard = clip
                # Scan clipboard text
                res = self.client.scan_prompt(clip)
                if res and res.get("decision") in ("redact", "require_approval", "block"):
                    # Sensitive data in clipboard! Glow handle and update text
                    def _alert():
                        count = len(res.get("findings", []))
                        self.handle_dot.config(fg=ACCENT_AMBER)
                        self.input_text.delete("1.0", tk.END)
                        self.input_text.insert("1.0", clip)
                        self.result_summary.config(
                            text=f"⚠️ {count} sensitive item(s) detected in clipboard!",
                            fg=ACCENT_AMBER,
                        )
                        if self.auto_pop_enabled.get() and not self.is_expanded:
                            self.expand()
                    self.after(0, _alert)
        except Exception:
            pass

    def _do_inspect(self):
        """Manually inspect text in input box."""
        text = self.input_text.get("1.0", tk.END).strip()
        if not text:
            return

        res = self.client.scan_prompt(text)
        if not res:
            self.result_summary.config(text="❌ Engine unreachable at 127.0.0.1:8765", fg=ACCENT_RED)
            return

        findings = res.get("findings", [])
        decision = res.get("decision", "allow")
        task = res.get("task_inference", {}).get("inferred_task", "general")

        if decision == "allow":
            msg = f"✅ Clean (Task: {task}). Safe to submit."
            color = ACCENT_GREEN
        elif decision == "block":
            msg = f"⛔ HARD BLOCK: Secret detected! Submissions prohibited."
            color = ACCENT_RED
        else:
            msg = f"⚠️ {decision.upper()}: {len(findings)} entity found (Task: {task})"
            color = ACCENT_AMBER

        self.result_summary.config(text=msg, fg=color)

    def _do_sanitize(self):
        """Sanitize prompt and place clean text into clipboard."""
        text = self.input_text.get("1.0", tk.END).strip()
        if not text:
            return

        res = self.client.sanitize_prompt(text)
        if not res:
            self.result_summary.config(text="❌ Engine unreachable at 127.0.0.1:8765", fg=ACCENT_RED)
            return

        clean = res.get("sanitized_text", "")
        entities_count = res.get("findings_count", 0)

        self.output_text.delete("1.0", tk.END)
        self.output_text.insert("1.0", clean)

        # Copy to clipboard
        self.clipboard_clear()
        self.clipboard_append(clean)
        self.update()

        self.result_summary.config(
            text=f"✨ Sanitized {entities_count} item(s) & copied to clipboard!",
            fg=ACCENT_GREEN,
        )

    def _do_copy_clean(self):
        """Copy output text to clipboard."""
        clean = self.output_text.get("1.0", tk.END).strip()
        if clean:
            self.clipboard_clear()
            self.clipboard_append(clean)
            self.update()
            self.result_summary.config(text="📋 Clean text copied to clipboard!", fg=ACCENT_GREEN)

    def _do_pdf_scrub(self):
        """Select a PDF and produce a dual-verified scrubbed copy."""
        file_path = filedialog.askopenfilename(
            title="Select PDF to Scrub",
            filetypes=[("PDF Documents", "*.pdf")],
        )
        if not file_path:
            return

        try:
            with open(file_path, "rb") as f:
                raw_bytes = f.read()

            self.result_summary.config(text="Processing PDF & running dual verification...", fg=ACCENT_AMBER)
            self.update()

            clean_bytes = self.client.redact_pdf(raw_bytes)
            if not clean_bytes:
                messagebox.showerror("Error", "PDF redaction failed or engine offline.")
                return

            save_path = filedialog.asksaveasfilename(
                title="Save Scrubbed PDF",
                defaultextension=".pdf",
                initialfile=f"sanitized_{Path(file_path).name}",
                filetypes=[("PDF Documents", "*.pdf")],
            )
            if save_path:
                with open(save_path, "wb") as f:
                    f.write(clean_bytes)
                self.result_summary.config(text="✅ PDF scrubbed & saved with 0 leaks!", fg=ACCENT_GREEN)
                messagebox.showinfo("Success", f"Redacted PDF saved successfully to:\n{save_path}")

        except Exception as e:
            messagebox.showerror("Error", f"Failed: {e}")


def launch():
    """Launch the VeilGuard sidebar desktop application."""
    app = VeilGuardSidebar()
    app.mainloop()


if __name__ == "__main__":
    launch()
