"""VeilGuard AI: Ultra-Thin Desktop Sidebar Companion.

An ultra-sleek, nearly invisible edge-docked sidebar that stays docked to the
screen edge and automatically slides open when AI tools (ChatGPT, Claude, Cursor,
Copilot, etc.) are focused, and vanishes/collapses when you switch away.

Features:
- Ultra-thin 6px edge sliver (almost invisible, semi-transparent when idle).
- Hover-expansion: Gently expands to 24px with shield icon when mouse approaches.
- Master Guard Switch: One-click toggle between [🟢 GUARD ON] and [⚪ PAUSED/OFF].
- Smart Auto-Pop & Auto-Go: Slides open when AI tools are in focus; automatically
  collapses and goes away when you switch to normal apps.
- Press 'Esc' to dismiss instantly.
- Direct connection to VeilGuard loopback engine (127.0.0.1:8765/analyze).
- Pure standard library Python (tkinter + ctypes + urllib), zero extra pip installs.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import urllib.request
import urllib.error

# Import modular core logic
try:
    from desktop.guard_core import (
        is_ai_window,
        get_foreground_window_title,
        get_auth_token,
        DEFAULT_ENGINE_URL,
        DEFAULT_PROFILE,
        AI_KEYWORDS,
    )
except ImportError:
    from guard_core import (
        is_ai_window,
        get_foreground_window_title,
        get_auth_token,
        DEFAULT_ENGINE_URL,
        DEFAULT_PROFILE,
        AI_KEYWORDS,
    )

ENGINE_URL = DEFAULT_ENGINE_URL

# Color Palette (Blue Glass Aesthetic)
BG_DARK = "#060b14"      # deep cosmic background
BG_PANEL = "#0a1120"     # frosted surface
BG_CARD = "#0f172a"      # elevated card
BG_INPUT = "#080e1a"     # deep input canvas
BORDER_COLOR = "#1e293b" # subtle border
TEXT_PRIMARY = "#f8fafc" # slate-50
TEXT_SECONDARY = "#94a3b8" # slate-400
TEXT_MUTED = "#64748b"   # slate-500
ACCENT_INDIGO = "#0284c7" # electric sky-600 handle
ACCENT_SKY = "#38bdf8"   # electric sky-400
ACCENT_CYAN = "#22d3ee"  # cyan highlight
ACCENT_GREEN = "#10b981" # emerald allow
ACCENT_AMBER = "#f59e0b" # amber redact
ACCENT_RED = "#ef4444"   # red block


class ForegroundDetector:
    """Detects active focused window title using Windows Win32 API via guard_core."""

    def get_active_window_title(self) -> str:
        return get_foreground_window_title()

    def is_ai_tool_focused(self) -> tuple[bool, str]:
        title = self.get_active_window_title()
        return is_ai_window(title), title



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

    def analyze_prompt(self, text: str, profile: str = DEFAULT_PROFILE) -> dict | None:
        try:
            payload = json.dumps({
                "text": text,
                "profile": profile,
                "source": "prompt",
                "destination": "chatgpt.com",
            }).encode("utf-8")
            req = urllib.request.Request(
                f"{self.base_url}/analyze",
                data=payload,
                headers=self._headers(),
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=4.0) as resp:
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
    """The ultra-thin, draggable desktop sidebar widget."""

    def __init__(self):
        super().__init__()

        self.title("VeilGuard AI Sidebar")
        self.client = VeilGuardClient()
        self.detector = ForegroundDetector()

        # State
        self.is_expanded = False
        self.guard_active = True  # Master On/Off switch
        self.auto_pop_enabled = tk.BooleanVar(value=True)
        self.clipboard_monitor_enabled = tk.BooleanVar(value=False)  # Rule 6: Opt-in only
        self.last_clipboard = ""
        self.last_sanitized_text = ""
        self.active_ai_app_name = ""
        self.is_dragging = False
        self.drag_start_y = 0
        self.is_hovered = False

        # Screen dimensions
        self.screen_w = self.winfo_screenwidth()
        self.screen_h = self.winfo_screenheight()

        # Ultra-thin collapsed dimensions
        self.thin_sliver_width = 6
        self.hover_sliver_width = 24
        self.collapsed_height = 96
        self.expanded_width = 380
        self.expanded_height = 600

        # Position docked to right screen edge
        self.win_y = max(60, (self.screen_h - self.expanded_height) // 2)

        # Style & Configuration
        self.configure(bg=BG_PANEL)
        self.overrideredirect(True)  # Frameless
        self.wm_attributes("-topmost", True)  # Always on top

        # Click outside to close / collapse automatically
        self.bind("<FocusOut>", self._on_focus_out)
        # Bind Esc to quickly dismiss
        self.bind("<Escape>", lambda e: self.collapse())
        # Bind Ctrl+L to clear prompt
        self.bind("<Control-l>", lambda e: self._do_clear())
        self.protocol("WM_DELETE_WINDOW", self.destroy)

        self._focus_check_timer = None

        # Build UI layout
        self._build_ui()
        self._apply_geometry()

        # Start background polling thread
        self.running = True
        self.poll_thread = threading.Thread(target=self._background_watcher, daemon=True)
        self.poll_thread.start()

    def _build_ui(self):
        """Construct the ultra-thin collapsed handle and the expanded panel."""
        self.main_container = tk.Frame(self, bg=BG_PANEL, highlightthickness=0)
        self.main_container.pack(fill="both", expand=True)

        # ---------------- 1. ULTRA-THIN EDGE SLIVER ----------------
        self.handle_frame = tk.Frame(
            self.main_container,
            bg=ACCENT_INDIGO,
            cursor="hand2",
            highlightthickness=0,
        )

        # Hover icon (revealed when mouse approaches edge)
        self.handle_icon = tk.Label(
            self.handle_frame,
            text="🛡️",
            fg="#FFFFFF",
            bg=ACCENT_INDIGO,
            font=("Segoe UI Emoji", 10),
        )

        self.handle_grip = tk.Label(
            self.handle_frame,
            text="⋮",
            fg="#FFFFFF",
            bg=ACCENT_INDIGO,
            font=("Segoe UI", 8, "bold"),
        )

        # Bind hover and drag events to sliver
        for widget in (self.handle_frame, self.handle_icon, self.handle_grip):
            widget.bind("<Enter>", self._on_handle_hover_enter)
            widget.bind("<Leave>", self._on_handle_hover_leave)
            widget.bind("<Button-1>", self._on_handle_click)
            widget.bind("<B1-Motion>", self._on_drag)

        # ---------------- 2. EXPANDED PANEL ----------------
        self.content_frame = tk.Frame(self.main_container, bg=BG_PANEL)

        # Top Header Bar
        header = tk.Frame(self.content_frame, bg=BG_PANEL)
        header.pack(fill="x", padx=12, pady=(10, 6))

        header_title = tk.Label(
            header,
            text="🛡️ VeilGuard",
            fg=TEXT_PRIMARY,
            bg=BG_PANEL,
            font=("Segoe UI", 11, "bold"),
        )
        header_title.pack(side="left")

        # Master On/Off Toggle Button
        self.master_btn = tk.Button(
            header,
            text="🟢 GUARD ON",
            bg=ACCENT_GREEN,
            fg="#FFFFFF",
            activebackground="#059669",
            activeforeground="#FFFFFF",
            relief="flat",
            padx=8,
            pady=2,
            font=("Segoe UI", 8, "bold"),
            cursor="hand2",
            command=self._toggle_master_guard,
        )
        self.master_btn.pack(side="left", padx=8)

        # Close / Dismiss Button
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

        # Drag handle
        drag_handle = tk.Label(
            header,
            text="⋮⋮ Drag",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 8),
            cursor="fleur",
        )
        drag_handle.pack(side="right", padx=6)
        drag_handle.bind("<Button-1>", self._start_drag)
        drag_handle.bind("<B1-Motion>", self._on_drag)

        # Active App Context Bar
        self.context_bar = tk.Frame(self.content_frame, bg=BG_CARD, padx=8, pady=5)
        self.context_bar.pack(fill="x", padx=12, pady=(0, 6))

        self.context_icon = tk.Label(self.context_bar, text="⚡", fg=ACCENT_GREEN, bg=BG_CARD, font=("Segoe UI", 9))
        self.context_icon.pack(side="left")

        self.context_label = tk.Label(
            self.context_bar,
            text="Auto-Guard Active",
            fg=TEXT_SECONDARY,
            bg=BG_CARD,
            font=("Segoe UI", 8),
        )
        self.context_label.pack(side="left", padx=6)

        # Settings row
        settings_row = tk.Frame(self.content_frame, bg=BG_PANEL)
        settings_row.pack(fill="x", padx=12, pady=(0, 6))

        cb_auto = tk.Checkbutton(
            settings_row,
            text="Auto-pop on AI Apps",
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
            text="ORIGINAL PROMPT:",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 8, "bold"),
            anchor="w",
        )
        input_label.pack(fill="x", padx=12, pady=(2, 2))

        self.input_text = tk.Text(
            self.content_frame,
            height=4,
            bg=BG_INPUT,
            fg=TEXT_PRIMARY,
            insertbackground=TEXT_PRIMARY,
            highlightthickness=1,
            highlightbackground=BORDER_COLOR,
            relief="flat",
            font=("Consolas", 9),
            wrap="word",
        )
        self.input_text.pack(fill="x", padx=12, pady=(0, 6))
        self.input_text.bind("<KeyRelease>", self._on_input_changed)
        self.input_text.bind("<<Paste>>", lambda e: self.after(50, self._on_input_changed))
        self.input_text.bind("<<Cut>>", lambda e: self.after(50, self._on_input_changed))
        self.input_text.bind("<Control-Return>", lambda e: (self._do_sanitize(), "break")[1])

        # Action Buttons Row
        btn_row = tk.Frame(self.content_frame, bg=BG_PANEL)
        btn_row.pack(fill="x", padx=12, pady=(0, 6))

        self.btn_inspect = tk.Button(
            btn_row,
            text="🔍 Inspect",
            bg=BG_CARD,
            fg=TEXT_PRIMARY,
            activebackground=BORDER_COLOR,
            activeforeground=TEXT_PRIMARY,
            relief="flat",
            padx=10,
            pady=3,
            font=("Segoe UI", 8, "bold"),
            cursor="hand2",
            command=self._do_inspect,
        )
        self.btn_inspect.pack(side="left")

        self.btn_clear = tk.Button(
            btn_row,
            text="🗑️ Clear",
            bg=BG_CARD,
            fg=TEXT_MUTED,
            activebackground=BORDER_COLOR,
            activeforeground=TEXT_PRIMARY,
            relief="flat",
            padx=8,
            pady=3,
            font=("Segoe UI", 8),
            cursor="hand2",
            command=self._do_clear,
        )
        self.btn_clear.pack(side="left", padx=(6, 0))

        self.btn_sanitize = tk.Button(
            btn_row,
            text="✨ Sanitize & Copy",
            bg=ACCENT_INDIGO,
            fg="#FFFFFF",
            activebackground="#4F46E5",
            activeforeground="#FFFFFF",
            relief="flat",
            padx=12,
            pady=3,
            font=("Segoe UI", 8, "bold"),
            cursor="hand2",
            command=self._do_sanitize,
        )
        self.btn_sanitize.pack(side="right")

        # Result Summary Box
        self.results_card = tk.Frame(self.content_frame, bg=BG_CARD, padx=8, pady=5)
        self.results_card.pack(fill="x", padx=12, pady=(0, 6))

        self.result_summary = tk.Label(
            self.results_card,
            text="Ready. Copy or type text to inspect.",
            fg=TEXT_SECONDARY,
            bg=BG_CARD,
            font=("Segoe UI", 8),
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
        clean_label.pack(fill="x", padx=12, pady=(2, 2))

        self.output_text = tk.Text(
            self.content_frame,
            height=4,
            bg=BG_INPUT,
            fg=ACCENT_GREEN,
            insertbackground=TEXT_PRIMARY,
            highlightthickness=1,
            highlightbackground=BORDER_COLOR,
            relief="flat",
            font=("Consolas", 9),
            wrap="word",
        )
        self.output_text.pack(fill="x", padx=12, pady=(0, 6))

        # Bottom Bar: Scrub PDF & Copy
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
            pady=2,
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
            pady=2,
            font=("Segoe UI", 8, "bold"),
            cursor="hand2",
            command=self._do_copy_clean,
        )
        self.btn_copy_clean.pack(side="right")

        # Dashboard Navigation Button (opens Privacy Dashboard in browser)
        dashboard_row = tk.Frame(self.content_frame, bg=BG_PANEL)
        dashboard_row.pack(fill="x", padx=12, pady=(0, 10))

        self.btn_open_dashboard = tk.Button(
            dashboard_row,
            text="📊 Open VeilGuard Dashboard",
            bg=BG_CARD,
            fg=ACCENT_INDIGO,
            activebackground=BORDER_COLOR,
            activeforeground="#A5B4FC",
            relief="flat",
            padx=10,
            pady=4,
            font=("Segoe UI", 9, "bold"),
            cursor="hand2",
            command=self._do_open_dashboard,
        )
        self.btn_open_dashboard.pack(fill="x")

        # Start in ultra-thin collapsed state
        self.collapse()

    def _apply_geometry(self):
        """Update window position and geometry."""
        if self.is_expanded:
            w = self.expanded_width
            h = self.expanded_height
            x = self.screen_w - w
            y = min(self.win_y, self.screen_h - h - 30)
            try:
                self.wm_attributes("-alpha", 0.98)
            except Exception:
                pass
        else:
            w = self.hover_sliver_width if self.is_hovered else self.thin_sliver_width
            h = self.collapsed_height
            x = self.screen_w - w
            y = min(self.win_y, self.screen_h - h - 30)
            try:
                # Barely visible (0.35) when idle, bright on hover
                alpha = 0.95 if self.is_hovered else (0.35 if self.guard_active else 0.15)
                self.wm_attributes("-alpha", alpha)
            except Exception:
                pass

        self.geometry(f"{w}x{h}+{x}+{y}")

    def _boot_engine_background(self):
        """Launch local Python engine in background if not running."""
        try:
            py = sys.executable
            root_dir = str(Path(__file__).resolve().parent.parent)
            subprocess.Popen(
                [py, "-m", "veilguard_engine.server"],
                cwd=root_dir,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
            )
        except Exception:
            pass

    def _toggle_master_guard(self):
        """Toggle master protection on or off, or auto-boot engine if offline."""
        if not self.client.check_health():
            self.master_btn.config(text="⏳ STARTING...", bg=ACCENT_AMBER)
            self.update()
            self._boot_engine_background()
            time.sleep(1.5)
            if self.client.check_health():
                self.guard_active = True
                self.master_btn.config(text="🟢 GUARD ON", bg=ACCENT_GREEN)
                self.handle_frame.config(bg=ACCENT_INDIGO)
                self.context_label.config(text="Guard Active")
                self._apply_geometry()
                return

        self.guard_active = not self.guard_active
        if self.guard_active:
            self.master_btn.config(text="🟢 GUARD ON", bg=ACCENT_GREEN)
            self.handle_frame.config(bg=ACCENT_INDIGO)
            self.context_label.config(text="Guard Active")
        else:
            self.master_btn.config(text="⚪ PAUSED", bg="#374151")
            self.handle_frame.config(bg="#374151")
            self.context_label.config(text="Guard Paused (Off)")
            self.collapse()
        self._apply_geometry()

    def _on_handle_hover_enter(self, event):
        """Gently expand sliver on mouse approach."""
        if not self.is_expanded:
            self.is_hovered = True
            self.handle_grip.pack(pady=(4, 0))
            self.handle_icon.pack(pady=2)
            self._apply_geometry()

    def _on_handle_hover_leave(self, event):
        """Shrink back to 6px when mouse leaves."""
        if not self.is_expanded:
            self.is_hovered = False
            self.handle_icon.pack_forget()
            self.handle_grip.pack_forget()
            self._apply_geometry()

    def expand(self):
        """Expand the sidebar to full width and focus input."""
        self.is_expanded = True
        self.handle_frame.pack_forget()
        self.content_frame.pack(fill="both", expand=True)
        self._apply_geometry()
        # Bring to top and focus input text so clicking outside triggers FocusOut
        try:
            self.lift()
            self.focus_force()
            self.input_text.focus_set()
        except Exception:
            pass

    def collapse(self):
        """Collapse into the ultra-thin 6px sliver."""
        self.is_expanded = False
        self.is_hovered = False
        if hasattr(self, "_focus_check_timer") and self._focus_check_timer:
            try:
                self.after_cancel(self._focus_check_timer)
            except Exception:
                pass
            self._focus_check_timer = None
        self.content_frame.pack_forget()
        self.handle_icon.pack_forget()
        self.handle_grip.pack_forget()
        self.handle_frame.pack(fill="both", expand=True)
        self._apply_geometry()

    def _on_focus_out(self, event):
        """When focus leaves, verify whether the user clicked outside the sidebar to close it."""
        if not self.is_expanded:
            return
        if hasattr(self, "_focus_check_timer") and self._focus_check_timer:
            try:
                self.after_cancel(self._focus_check_timer)
            except Exception:
                pass
        self._focus_check_timer = self.after(140, self._check_focus_loss)

    def _check_focus_loss(self):
        self._focus_check_timer = None
        if not self.is_expanded:
            return

        # 1. Did focus move to another widget inside our window?
        try:
            curr = self.focus_get()
            if curr is not None:
                return
        except Exception:
            pass

        # 2. Check mouse pointer position on screen
        try:
            mx = self.winfo_pointerx()
            my = self.winfo_pointery()
            wx = self.winfo_rootx()
            wy = self.winfo_rooty()
            ww = self.winfo_width()
            wh = self.winfo_height()
            if (wx <= mx <= wx + ww) and (wy <= my <= wy + wh):
                # Mouse pointer is still inside our sidebar window bounds
                return
        except Exception:
            pass

        # 3. Focus lost to an external app or desktop and mouse is outside -> Collapse!
        self.collapse()

    def _on_handle_click(self, event):
        """Expand on click."""
        if not self.is_dragging:
            self.expand()

    def _start_drag(self, event):
        self.is_dragging = True
        self.drag_start_y = event.y_root - self.winfo_y()

    def _on_drag(self, event):
        """Drag up or down along the screen edge."""
        new_y = event.y_root - self.drag_start_y
        new_y = max(20, min(self.screen_h - 100, new_y))
        self.win_y = new_y
        self._apply_geometry()

    def _background_watcher(self):
        """Detects active AI tools and automatically pops open or collapses."""
        was_ai_focused = False
        last_health_check = 0.0

        while self.running:
            try:
                # If master guard is off, stay dormant
                if not self.guard_active:
                    time.sleep(0.8)
                    continue

                # 1. Throttled health check to avoid socket thrashing (every 5.0 seconds)
                now = time.time()
                if now - last_health_check > 5.0:
                    is_healthy = self.client.check_health()
                    self._update_health_badge(is_healthy)
                    last_health_check = now

                # 2. Check active foreground window
                is_ai, title = self.detector.is_ai_tool_focused()

                if "veilguard" in title.lower():
                    # Keep previous active context while interacting with sidebar
                    pass
                elif is_ai:
                    if title != self.active_ai_app_name:
                        self.active_ai_app_name = title
                        self._on_chat_switched(title)

                    self._update_context_badge(f"Active: {title[:24]}...", True)

                    # Auto-expand when switching into AI tool from another app
                    if not was_ai_focused and self.auto_pop_enabled.get():
                        if not self.is_expanded:
                            self.after(0, self.expand)
                    was_ai_focused = True

                else:
                    self._update_context_badge("Standing by (No AI app active)", False)
                    # AUTO-GO / AUTO-COLLAPSE when leaving AI tools
                    if was_ai_focused and self.auto_pop_enabled.get():
                        if self.is_expanded:
                            self.after(0, self.collapse)
                    was_ai_focused = False

                # 3. Check clipboard for prompt changes (Rule 6: only while AI app is focused and user explicitly opted in)
                if self.clipboard_monitor_enabled.get() and self.guard_active and was_ai_focused:
                    self._check_clipboard_quietly()

            except Exception:
                pass

            time.sleep(0.5)

    def _on_chat_switched(self, new_title: str):
        """When switching to a different chat tab or window, reset stale warnings if prompt is empty."""
        def _reset():
            curr = self.input_text.get("1.0", tk.END).strip()
            if not curr:
                self.result_summary.config(
                    text="Ready. No sensitive items.",
                    fg=TEXT_SECONDARY,
                )
                self.output_text.delete("1.0", tk.END)
                self.last_clipboard = ""
            else:
                self._live_inspect()
        self.after(0, _reset)

    def _on_input_changed(self, event=None):
        """Immediately sync warning status with whatever text is currently in the prompt box."""
        text = self.input_text.get("1.0", tk.END).strip()

        # If there is nothing in the prompt box, warning MUST show NOTHING / Ready!
        if not text:
            self.result_summary.config(
                text="Ready. No sensitive items.",
                fg=TEXT_SECONDARY,
            )
            self.output_text.delete("1.0", tk.END)
            if hasattr(self, "_debounce_timer") and self._debounce_timer:
                self.after_cancel(self._debounce_timer)
                self._debounce_timer = None
            return

        # Debounce live inspection so typing remains snappy
        if hasattr(self, "_debounce_timer") and self._debounce_timer:
            self.after_cancel(self._debounce_timer)
        self._debounce_timer = self.after(350, self._live_inspect)

    def _live_inspect(self):
        """Run inspection on the current prompt text and update warnings in real-time."""
        text = self.input_text.get("1.0", tk.END).strip()
        if not text:
            self.result_summary.config(
                text="Ready. No sensitive items.",
                fg=TEXT_SECONDARY,
            )
            self.output_text.delete("1.0", tk.END)
            return

        res = self.client.analyze_prompt(text)
        if not res:
            return

        findings = res.get("findings", [])
        decision = res.get("decision", "allow")
        clean = res.get("sanitization", {}).get("sanitized_text", "")

        if decision == "allow" or not findings:
            self.result_summary.config(
                text="✅ Clean prompt (0 sensitive items). Safe to submit.",
                fg=ACCENT_GREEN,
            )
            if clean:
                self.output_text.delete("1.0", tk.END)
                self.output_text.insert("1.0", clean)
        elif decision == "block":
            self.result_summary.config(
                text=f"⛔ HARD BLOCK: {len(findings)} secret(s) detected!",
                fg=ACCENT_RED,
            )
            if clean:
                self.output_text.delete("1.0", tk.END)
                self.output_text.insert("1.0", clean)
        else:
            self.result_summary.config(
                text=f"⚠️ {len(findings)} sensitive item(s) detected in prompt!",
                fg=ACCENT_AMBER,
            )
            if clean:
                self.output_text.delete("1.0", tk.END)
                self.output_text.insert("1.0", clean)

    def _do_clear(self):
        """Immediately clear all inputs, outputs, clipboard cache, and reset warnings."""
        self.input_text.delete("1.0", tk.END)
        self.output_text.delete("1.0", tk.END)
        self.last_clipboard = ""
        self.last_sanitized_text = ""
        if hasattr(self, "_debounce_timer") and self._debounce_timer:
            self.after_cancel(self._debounce_timer)
            self._debounce_timer = None
        self.result_summary.config(
            text="Ready. Prompt cleared.",
            fg=TEXT_SECONDARY,
        )

    def _update_health_badge(self, is_healthy: bool):
        def _update():
            if self.guard_active:
                if is_healthy:
                    self.master_btn.config(text="🟢 GUARD ON", bg=ACCENT_GREEN)
                else:
                    self.master_btn.config(text="🔴 ENGINE OFFLINE", bg=ACCENT_RED)
        self.after(0, _update)

    def _update_context_badge(self, text: str, is_active: bool):
        def _update():
            # Rule 6: Show visible indicator when clipboard guard is actively running
            clip_status = " • 📋 CLIPBOARD GUARD ACTIVE" if (self.clipboard_monitor_enabled.get() and is_active) else ""
            self.context_label.config(text=f"{text}{clip_status}")
            if is_active:
                self.context_icon.config(text="⚡", fg=ACCENT_GREEN)
            else:
                self.context_icon.config(text="💤", fg=TEXT_MUTED)
        self.after(0, _update)

    def _check_clipboard_quietly(self):
        """Inspect clipboard without stealing focus or overwriting active input."""
        try:
            clip = self.clipboard_get()
            if not clip or clip == self.last_clipboard or clip == self.last_sanitized_text:
                return
            if len(clip.strip()) <= 5:
                return
            self.last_clipboard = clip

            res = self.client.analyze_prompt(clip)
            if res and res.get("decision") in ("redact", "require_approval", "block"):
                def _alert():
                    # Only insert into ORIGINAL PROMPT if it was empty, so we don't destroy user edits!
                    curr = self.input_text.get("1.0", tk.END).strip()
                    if not curr or curr == self.last_sanitized_text:
                        self.input_text.delete("1.0", tk.END)
                        self.input_text.insert("1.0", clip)

                        clean = res.get("sanitization", {}).get("sanitized_text", "")
                        if clean:
                            self.output_text.delete("1.0", tk.END)
                            self.output_text.insert("1.0", clean)

                        count = len(res.get("findings", []))
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
        """Inspect prompt text."""
        text = self.input_text.get("1.0", tk.END).strip()
        if not text:
            return

        res = self.client.analyze_prompt(text)
        if not res:
            self.result_summary.config(text="❌ Engine unreachable at 127.0.0.1:8765", fg=ACCENT_RED)
            return

        findings = res.get("findings", [])
        decision = res.get("decision", "allow")
        task = res.get("context", {}).get("task", {}).get("type", "general") if res.get("context") else "general"

        if decision == "allow":
            msg = f"✅ Clean (Task: {task}). Safe to submit."
            color = ACCENT_GREEN
        elif decision == "block":
            msg = f"⛔ HARD BLOCK: Secret detected! Submissions prohibited."
            color = ACCENT_RED
        else:
            msg = f"⚠️ {decision.upper()}: {len(findings)} sensitive item(s) found (Task: {task})"
            color = ACCENT_AMBER

        self.result_summary.config(text=msg, fg=color)

    def _do_sanitize(self):
        """Sanitize prompt: preserves ORIGINAL PROMPT and writes sanitized text to output."""
        text = self.input_text.get("1.0", tk.END).strip()
        if not text:
            return

        res = self.client.analyze_prompt(text)
        if not res:
            self.result_summary.config(text="❌ Engine unreachable at 127.0.0.1:8765", fg=ACCENT_RED)
            return

        sanitization = res.get("sanitization")
        if sanitization and sanitization.get("sanitized_text"):
            clean = sanitization.get("sanitized_text")
        else:
            clean = text

        entities_count = len(res.get("findings", []))

        # 1. ORIGINAL PROMPT stays 100% UNTOUCHED!
        # 2. Put sanitized text into SANITIZED OUTPUT
        self.output_text.delete("1.0", tk.END)
        self.output_text.insert("1.0", clean)

        # 3. Mark as sanitized by us so clipboard watcher won't overwrite input
        self.last_sanitized_text = clean
        self.last_clipboard = clean

        # 4. Copy to clipboard
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
            self.last_sanitized_text = clean
            self.last_clipboard = clean
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

    def _do_open_dashboard(self):
        """Open the VeilGuard Privacy Dashboard in the browser."""
        import webbrowser
        dashboard_url = "https://veilguard-ai.vercel.app"
        try:
            webbrowser.open(dashboard_url)
            self.result_summary.config(text="📊 Opened VeilGuard Dashboard in browser!", fg=ACCENT_GREEN)
        except Exception:
            try:
                webbrowser.open("http://127.0.0.1:8765/health")
                self.result_summary.config(text="📊 Opened VeilGuard status in browser!", fg=ACCENT_GREEN)
            except Exception as e:
                self.result_summary.config(text=f"Failed to open browser: {e}", fg=ACCENT_RED)

    def destroy(self):
        """Rule 5 & 6: Wipe all prompt and clipboard buffers before closing window."""
        self.running = False
        try:
            self.input_text.delete("1.0", tk.END)
            self.output_text.delete("1.0", tk.END)
        except Exception:
            pass
        self.last_clipboard = ""
        self.last_sanitized_text = ""
        super().destroy()


def ensure_single_instance():
    """Ensure only one instance of the sidebar runs at a time."""
    try:
        ERROR_ALREADY_EXISTS = 183
        mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\VeilGuardSidebarSingleInstance")
        if ctypes.windll.kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
            sys.exit(0)
        return mutex
    except Exception:
        return None


def launch():
    """Launch the VeilGuard sidebar desktop application."""
    _mutex = ensure_single_instance()
    app = VeilGuardSidebar()
    app.mainloop()


if __name__ == "__main__":
    launch()
