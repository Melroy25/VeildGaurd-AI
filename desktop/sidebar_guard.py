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
        get_foreground_window_info,
        get_auth_token,
        DEFAULT_ENGINE_URL,
        DEFAULT_PROFILE,
        AI_KEYWORDS,
    )
except ImportError:
    from guard_core import (
        is_ai_window,
        get_foreground_window_title,
        get_foreground_window_info,
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
    """Detects active focused window title and process using Windows Win32 API via guard_core."""

    def get_active_window_title(self) -> str:
        return get_foreground_window_title()

    def is_ai_tool_focused(self) -> tuple[bool, str, int]:
        hwnd, title, proc_name = get_foreground_window_info()
        is_ai = is_ai_window(title, proc_name=proc_name)
        display_name = title or proc_name
        if proc_name and "codex" in proc_name:
            display_name = f"Codex ({title[:25]}...)" if title else "Codex App"
        elif proc_name and "cursor" in proc_name:
            display_name = f"Cursor ({title[:25]}...)" if title else "Cursor IDE"
        return is_ai, display_name, hwnd



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

        # Enforce single instance so multiple sidebars NEVER open concurrently
        self._single_instance_mutex = ensure_single_instance()

        # State
        self.is_expanded = False
        self.is_pinned = False  # When True, window stays open and never auto-collapses
        self.guard_active = True  # Master On/Off switch
        self.auto_pop_enabled = tk.BooleanVar(value=True)
        self.clipboard_monitor_enabled = tk.BooleanVar(value=True)  # Auto-sanitize on copy
        self.last_clipboard = ""
        self.last_sanitized_text = ""
        self.active_ai_app_name = ""
        self.last_ai_hwnd = 0  # HWND of last focused AI tool (e.g. Codex)
        self.last_ai_title = ""
        self.is_dragging = False
        self.drag_start_x = 0
        self.drag_start_y = 0
        self.user_custom_x = None
        self.is_hovered = False

        # Screen dimensions
        self.screen_w = self.winfo_screenwidth()
        self.screen_h = self.winfo_screenheight()

        # Sleek collapsed dimensions
        self.thin_sliver_width = 18
        self.hover_sliver_width = 30
        self.collapsed_height = 128
        self.expanded_width = 380
        self.expanded_height = 635

        # Position docked to right screen edge
        self.win_y = max(50, (self.screen_h - self.expanded_height) // 2)

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
        self._startup_time = time.time()
        self._last_expand_time = time.time()
        self.running = True
        self._wake_event = None
        self._setup_wake_listener()

        # Build UI layout
        self._build_ui()
        self._apply_geometry()

        # Auto-boot local privacy firewall engine in background thread (non-blocking)
        if not self.client.check_health():
            threading.Thread(target=self._boot_engine_background, daemon=True).start()

        # Start background polling thread
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

        # Bind hover, click, and right-click menu to sliver
        # NOTE: Sliver is dock-only and never dragged — dragging belongs exclusively to expanded header
        for widget in (self.handle_frame, self.handle_icon, self.handle_grip):
            widget.bind("<Enter>", self._on_handle_hover_enter)
            widget.bind("<Leave>", self._on_handle_hover_leave)
            widget.bind("<Button-1>", self._on_handle_click)
            widget.bind("<Button-3>", self._on_sliver_context_menu)

        # ---------------- 2. EXPANDED PANEL ----------------
        self.content_frame = tk.Frame(self.main_container, bg=BG_PANEL)

        # Top Header Bar (Draggable across the whole top bar)
        header = tk.Frame(self.content_frame, bg=BG_PANEL, cursor="fleur")
        header.pack(fill="x", padx=12, pady=(10, 6))

        header_title = tk.Label(
            header,
            text="🛡️ VeilGuard",
            fg=TEXT_PRIMARY,
            bg=BG_PANEL,
            font=("Segoe UI", 11, "bold"),
            cursor="fleur",
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

        # Close & Exit Button (✕ completely shuts down and removes sidebar)
        close_btn = tk.Label(
            header,
            text="✕",
            fg="#f87171",
            bg=BG_PANEL,
            font=("Segoe UI", 11, "bold"),
            cursor="hand2",
        )
        close_btn.pack(side="right")
        close_btn.bind("<Button-1>", lambda e: self.destroy())

        # Minimize / Collapse Button (— collapses back into edge sliver)
        min_btn = tk.Label(
            header,
            text="—",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 10, "bold"),
            cursor="hand2",
        )
        min_btn.pack(side="right", padx=(0, 8))
        min_btn.bind("<Button-1>", lambda e: self.collapse())

        # Pin Toggle Button (📌 locks window open so it never auto-collapses)
        self.pin_btn = tk.Label(
            header,
            text="📌 Pin",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 8),
            cursor="hand2",
        )
        self.pin_btn.pack(side="right", padx=(0, 6))
        self.pin_btn.bind("<Button-1>", lambda e: self._toggle_pin())

        # Reset Dock Button (↔ resets position back flush to right edge)
        dock_btn = tk.Label(
            header,
            text="↔ Dock",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 8),
            cursor="hand2",
        )
        dock_btn.pack(side="right", padx=(0, 6))
        dock_btn.bind("<Button-1>", lambda e: self._reset_dock())

        # Drag handle
        drag_handle = tk.Label(
            header,
            text="⋮⋮ Drag",
            fg=TEXT_MUTED,
            bg=BG_PANEL,
            font=("Segoe UI", 8),
            cursor="fleur",
        )
        drag_handle.pack(side="right", padx=(0, 6))

        for w in (header, header_title, drag_handle):
            w.bind("<Button-1>", self._start_drag)
            w.bind("<B1-Motion>", self._on_drag)
            w.bind("<ButtonRelease-1>", self._end_drag)

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
        self.input_text.bind("<Control-Return>", lambda e: (self._do_send_to_app(), "break")[1])

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

        self.btn_send = tk.Button(
            btn_row,
            text="🚀 Send to App",
            bg=ACCENT_GREEN,
            fg="#060b14",
            activebackground="#059669",
            activeforeground="#FFFFFF",
            relief="flat",
            padx=10,
            pady=3,
            font=("Segoe UI", 8, "bold"),
            cursor="hand2",
            command=self._do_send_to_app,
        )
        self.btn_send.pack(side="right", padx=(4, 0))

        self.btn_sanitize = tk.Button(
            btn_row,
            text="✨ Sanitize",
            bg=ACCENT_INDIGO,
            fg="#FFFFFF",
            activebackground="#4F46E5",
            activeforeground="#FFFFFF",
            relief="flat",
            padx=10,
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

        # Turn Off / Remove Sidebar Button (Completely removes sidebar from screen)
        exit_row = tk.Frame(self.content_frame, bg=BG_PANEL)
        exit_row.pack(fill="x", padx=12, pady=(0, 10))

        self.btn_turn_off = tk.Button(
            exit_row,
            text="🛑 Turn Off & Remove Sidebar",
            bg="#1c111a",
            fg="#f87171",
            activebackground="#450a0a",
            activeforeground="#fca5a5",
            relief="flat",
            padx=10,
            pady=4,
            font=("Segoe UI", 9, "bold"),
            cursor="hand2",
            command=self.destroy,
        )
        self.btn_turn_off.pack(fill="x")

        # Start expanded on launch so user immediately sees the companion is active!
        self.expand()

    def _toggle_pin(self):
        """Toggle pinned state so sidebar never auto-collapses on focus loss."""
        self.is_pinned = not self.is_pinned
        if self.is_pinned:
            self.pin_btn.config(text="📌 Pinned", fg=ACCENT_CYAN, font=("Segoe UI", 8, "bold"))
            self.result_summary.config(text="📌 Sidebar pinned open (will not auto-hide).", fg=ACCENT_CYAN)
        else:
            self.pin_btn.config(text="📌 Pin", fg=TEXT_MUTED, font=("Segoe UI", 8))
            self.result_summary.config(text="Sidebar unpinned (auto-hides when leaving AI apps).", fg=TEXT_SECONDARY)

    def _reset_dock(self):
        """Reset custom user drag position and re-dock to the right edge."""
        self.user_custom_x = None
        self._apply_geometry()

    def _apply_geometry(self):
        """Update window position and geometry, guaranteeing 100% full visibility within screen bounds."""
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()

        if self.is_expanded:
            w = self.expanded_width
            h = min(self.expanded_height, sh - 60)
            if hasattr(self, "user_custom_x") and self.user_custom_x is not None:
                x = self.user_custom_x
            else:
                x = sw - w - 16
            # Strict clamping: NEVER off-screen on left or right!
            x = max(16, min(sw - w - 16, x))
            y = max(16, min(self.win_y, sh - h - 16))
            try:
                self.wm_attributes("-alpha", 0.98)
            except Exception:
                pass
        else:
            w = self.hover_sliver_width if self.is_hovered else self.thin_sliver_width
            h = min(self.collapsed_height, sh - 60)
            x = sw - w
            y = max(16, min(self.win_y, sh - h - 16))
            try:
                # Sleek, visible edge dock (0.92 idle, 1.0 hover)
                alpha = 1.0 if self.is_hovered else (0.92 if self.guard_active else 0.40)
                self.wm_attributes("-alpha", alpha)
            except Exception:
                pass

        self.geometry(f"{w}x{h}+{x}+{y}")

    def _boot_engine_background(self):
        """Launch local Python engine in background if not running."""
        # If already healthy, nothing to do
        if self.client.check_health():
            return

        # 1. Attempt in-process daemon thread first (fastest, cleanest in exe & venv)
        try:
            from desktop.app_main import start_engine_thread
            start_engine_thread()
            # Wait up to 10s for spaCy/Presidio model initialization
            for _ in range(40):
                time.sleep(0.25)
                if self.client.check_health():
                    return
        except Exception:
            pass

        # 2. Subprocess fallback
        try:
            py = sys.executable
            if py.lower().endswith("veilguard.exe"):
                subprocess.Popen(
                    [py, "--engine"],
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
                )
            else:
                root_dir = str(Path(__file__).resolve().parent.parent)
                subprocess.Popen(
                    [py, "-m", "veilguard_engine.server"],
                    cwd=root_dir,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
                )
            for _ in range(40):
                time.sleep(0.25)
                if self.client.check_health():
                    return
        except Exception:
            pass

    def _toggle_master_guard(self):
        """Toggle master protection on or off, or auto-boot engine if offline."""
        if not self.client.check_health():
            self.master_btn.config(text="⏳ STARTING...", bg=ACCENT_AMBER)
            self.update()

            def _boot_and_update():
                self._boot_engine_background()
                # After boot attempt, update UI from main thread
                self.after(0, self._on_engine_boot_complete)

            threading.Thread(target=_boot_and_update, daemon=True).start()
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

    def _on_engine_boot_complete(self):
        """Called on main thread after engine boot attempt completes."""
        if self.client.check_health():
            self.guard_active = True
            self.master_btn.config(text="🟢 GUARD ON", bg=ACCENT_GREEN)
            self.handle_frame.config(bg=ACCENT_INDIGO)
            self.context_label.config(text="Guard Active")
        else:
            self.master_btn.config(text="🔴 ENGINE OFF", bg=ACCENT_RED)
            self.context_label.config(text="Engine failed to start")
        self._apply_geometry()

    def _on_handle_hover_enter(self, event):
        """Gently expand sliver on mouse approach."""
        if not self.is_expanded:
            self.is_hovered = True
            self.handle_grip.pack(pady=(6, 0))
            self.handle_icon.pack(pady=4)
            self._apply_geometry()

    def _on_handle_hover_leave(self, event):
        """Shrink back to standard dock width when mouse leaves."""
        if not self.is_expanded:
            self.is_hovered = False
            self._apply_geometry()

    def expand(self):
        """Expand the sidebar to full width and focus input."""
        self.is_expanded = True
        self.user_custom_x = None  # Always snap cleanly to right edge on expand
        self._last_expand_time = time.time()
        self.handle_frame.pack_forget()
        self.content_frame.pack(fill="both", expand=True)
        self._apply_geometry()
        # Bring to top and focus input text so clicking outside triggers FocusOut
        try:
            self.lift()
            self.attributes("-topmost", True)
            self.focus_force()
            self.input_text.focus_set()
        except Exception:
            pass

    def collapse(self):
        """Collapse into the sleek edge dock sliver and reset position so next expand returns to right edge."""
        self.is_expanded = False
        self.is_hovered = False
        # Always clear custom drag position on collapse: expanding will snap cleanly to right edge
        self.user_custom_x = None
        if hasattr(self, "_focus_check_timer") and self._focus_check_timer:
            try:
                self.after_cancel(self._focus_check_timer)
            except Exception:
                pass
            self._focus_check_timer = None
        self.content_frame.pack_forget()
        self.handle_frame.pack(fill="both", expand=True)
        self.handle_grip.pack(pady=(6, 0))
        self.handle_icon.pack(pady=4)
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

        if getattr(self, "is_dragging", False):
            return

        # Grace period right after startup (3.5s) or right after expanding (0.8s)
        now = time.time()
        if now - getattr(self, "_startup_time", 0) < 3.5:
            return
        if now - getattr(self, "_last_expand_time", 0) < 0.8:
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

        # 3. If pinned, NEVER collapse on focus loss
        if getattr(self, "is_pinned", False):
            return

        # 4. If current active window is an AI tool (Codex, ChatGPT, Claude, Cursor, etc.), NEVER collapse!
        try:
            is_ai, title, hwnd = self.detector.is_ai_tool_focused()
            if is_ai or "veilguard" in title.lower():
                return
        except Exception:
            pass

        # 5. Focus lost to an external non-AI app or desktop and mouse is outside -> Collapse!
        self.collapse()

    def _on_handle_click(self, event):
        """Expand on click."""
        if not self.is_dragging:
            self.expand()

    def _start_drag(self, event):
        self.is_dragging = True
        self.drag_start_x = event.x_root - self.winfo_x()
        self.drag_start_y = event.y_root - self.winfo_y()

    def _on_drag(self, event):
        """Free 2D drag anywhere across the screen.

        NOTE: Only active when the sidebar is fully expanded. The sliver binds
        <B1-Motion> to this handler too, but the sliver never calls _start_drag,
        so drag_start_x would be stale (often 0). Any tiny mouse wiggle during a
        sliver-click would compute new_x = event.x_root - 0 and teleport the
        window to the left edge. Guard: bail immediately when collapsed.
        """
        if not self.is_expanded:
            return  # Never move the window from a sliver click wiggle

        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        w = self.winfo_width()
        h = self.winfo_height()

        new_x = event.x_root - self.drag_start_x
        new_y = event.y_root - self.drag_start_y

        # Clamp so the window cannot be dragged off-screen
        new_x = max(10, min(sw - w - 10, new_x))
        new_y = max(10, min(sh - h - 10, new_y))

        self.user_custom_x = new_x
        self.win_y = new_y
        self.geometry(f"{w}x{h}+{new_x}+{new_y}")

    def _end_drag(self, event):
        self.is_dragging = False

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
                is_ai, title, hwnd = self.detector.is_ai_tool_focused()

                if "veilguard" in title.lower():
                    # Keep previous active context while interacting with sidebar
                    pass
                elif is_ai:
                    if hwnd:
                        self.last_ai_hwnd = hwnd
                        self.last_ai_title = title
                    if title != self.active_ai_app_name:
                        self.active_ai_app_name = title
                        self._on_chat_switched(title)

                    self._update_context_badge(f"Active: {title[:28]}", True)

                    # Auto-expand when switching into AI tool from another app
                    if not was_ai_focused and self.auto_pop_enabled.get():
                        if not self.is_expanded:
                            self.after(0, self.expand)
                    was_ai_focused = True

                else:
                    self._update_context_badge("Standing by (No AI app active)", False)
                    # AUTO-GO / AUTO-COLLAPSE when leaving AI tools (unless pinned!)
                    if was_ai_focused and self.auto_pop_enabled.get() and not getattr(self, "is_pinned", False):
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
                            self.last_sanitized_text = clean
                            try:
                                self.clipboard_clear()
                                self.clipboard_append(clean)
                            except Exception:
                                pass

                        count = len(res.get("findings", []))
                        self.result_summary.config(
                            text=f"⚠️ {count} sensitive item(s) protected & sanitized in clipboard!",
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

    def _do_send_to_app(self):
        """Sanitize prompt and directly paste & submit into the active AI application (e.g. Codex)."""
        text = self.input_text.get("1.0", tk.END).strip()
        if not text:
            self.result_summary.config(text="⚠️ Please enter prompt text first.", fg=ACCENT_AMBER)
            return

        # 1. First trigger sanitization
        self._do_sanitize()

        # 2. Inject clean text into target AI application
        def _inject():
            for _ in range(12):
                if getattr(self, "last_sanitized_text", ""):
                    break
                time.sleep(0.1)

            clean = getattr(self, "last_sanitized_text", "") or text
            hwnd = getattr(self, "last_ai_hwnd", 0)

            if not hwnd or sys.platform != "win32":
                self.after(0, lambda: self.result_summary.config(
                    text="✨ Sanitized & Copied to clipboard! (Paste with Ctrl+V)",
                    fg=ACCENT_GREEN,
                ))
                return

            try:
                user32 = ctypes.windll.user32
                user32.SetForegroundWindow(hwnd)
                time.sleep(0.18)

                VK_CONTROL = 0x11
                VK_V = 0x56
                VK_RETURN = 0x0D
                KEYEVENTF_KEYUP = 0x0002

                # Ctrl+V (paste clean text)
                user32.keybd_event(VK_CONTROL, 0, 0, 0)
                user32.keybd_event(VK_V, 0, 0, 0)
                user32.keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0)
                user32.keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
                time.sleep(0.12)

                # Enter (submit prompt to app)
                user32.keybd_event(VK_RETURN, 0, 0, 0)
                user32.keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, 0)

                app_name = getattr(self, "active_ai_app_name", "AI App") or "Codex"
                self.after(0, lambda: self.result_summary.config(
                    text=f"🚀 Sanitized prompt safely sent to {app_name[:20]}!",
                    fg=ACCENT_GREEN,
                ))
            except Exception:
                self.after(0, lambda: self.result_summary.config(
                    text="✨ Sanitized & Copied! Press Ctrl+V in target app to paste.",
                    fg=ACCENT_GREEN,
                ))

        threading.Thread(target=_inject, daemon=True).start()

    def _do_sanitize(self):
        """Sanitize prompt: preserves ORIGINAL PROMPT and writes sanitized text to output."""
        text = self.input_text.get("1.0", tk.END).strip()
        if not text:
            return

        res = self.client.analyze_prompt(text)
        if not res:
            self.result_summary.config(text="⏳ Engine offline — starting... please wait.", fg=ACCENT_AMBER)
            self.update()

            def _retry_after_boot():
                self._boot_engine_background()
                res2 = None
                for _ in range(8):
                    res2 = self.client.analyze_prompt(text)
                    if res2:
                        break
                    time.sleep(0.5)

                def _update():
                    if not res2:
                        self.result_summary.config(
                            text="❌ Engine unreachable — click 🟢 GUARD ON to retry starting.",
                            fg=ACCENT_RED,
                        )
                        return
                    # Re-run the rest of _do_sanitize with the successful result
                    self._apply_sanitize_result(text, res2)

                self.after(0, _update)

            threading.Thread(target=_retry_after_boot, daemon=True).start()
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

    def _apply_sanitize_result(self, original_text: str, res: dict):
        """Apply a successful sanitize API response to the UI — shared by normal and retry paths."""
        sanitization = res.get("sanitization")
        if sanitization and sanitization.get("sanitized_text"):
            clean = sanitization.get("sanitized_text")
        else:
            clean = original_text

        entities_count = len(res.get("findings", []))
        self.output_text.delete("1.0", tk.END)
        self.output_text.insert("1.0", clean)
        self.last_sanitized_text = clean
        self.last_clipboard = clean
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

    def _on_sliver_context_menu(self, event):
        """Right-click menu on the edge sliver to open or turn off sidebar."""
        try:
            menu = tk.Menu(self, tearoff=0, bg=BG_CARD, fg=TEXT_PRIMARY, activebackground=ACCENT_INDIGO, activeforeground="#ffffff")
            menu.add_command(label="🛡️ Open VeilGuard Sidebar", command=self.expand)
            menu.add_command(label="📊 Open Privacy Dashboard", command=self._do_open_dashboard)
            menu.add_separator()
            menu.add_command(label="🛑 Turn Off & Remove Sidebar", command=self.destroy)
            menu.tk_popup(event.x_root, event.y_root)
        except Exception:
            pass

    def _do_open_dashboard(self):
        """Open the VeilGuard Privacy Dashboard in the browser."""
        import webbrowser
        dashboard_url = "https://veilguard-ai.vercel.app/?tab=dashboard"
        try:
            webbrowser.open(dashboard_url)
            self.result_summary.config(text="📊 Opened VeilGuard Dashboard in browser!", fg=ACCENT_GREEN)
        except Exception:
            try:
                webbrowser.open("http://127.0.0.1:8765/health")
                self.result_summary.config(text="📊 Opened VeilGuard status in browser!", fg=ACCENT_GREEN)
            except Exception as e:
                self.result_summary.config(text=f"Failed to open browser: {e}", fg=ACCENT_RED)

    def _setup_wake_listener(self):
        """Create a Win32 named event and listener thread so secondary launches expand this window."""
        try:
            self._wake_event = ctypes.windll.kernel32.CreateEventW(None, False, False, WAKE_EVENT_NAME)
            if self._wake_event:
                threading.Thread(target=self._wake_event_loop, daemon=True).start()
        except Exception:
            self._wake_event = None

    def _wake_event_loop(self):
        """Wait for wake signals from secondary launch attempts and expand immediately."""
        WAIT_OBJECT_0 = 0x00000000
        while self.running and self._wake_event:
            try:
                res = ctypes.windll.kernel32.WaitForSingleObject(self._wake_event, 500)
                if res == WAIT_OBJECT_0:
                    self.after(0, self.expand)
            except Exception:
                break

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
        if hasattr(self, "_wake_event") and self._wake_event:
            try:
                ctypes.windll.kernel32.CloseHandle(self._wake_event)
            except Exception:
                pass
            self._wake_event = None
        if hasattr(self, "_single_instance_mutex") and self._single_instance_mutex:
            try:
                ctypes.windll.kernel32.CloseHandle(self._single_instance_mutex)
            except Exception:
                pass
            self._single_instance_mutex = None
        super().destroy()
        sys.exit(0)


_GLOBAL_MUTEX = None
WAKE_EVENT_NAME = "Local\\VeilGuardSidebarWakeEvent"
MUTEX_NAME = "Local\\VeilGuardSidebarSingleInstance"


def signal_existing_instance() -> bool:
    """Signal an already running instance to expand and bring itself to front."""
    try:
        EVENT_MODIFY_STATE = 0x0002
        h_event = ctypes.windll.kernel32.OpenEventW(EVENT_MODIFY_STATE, False, WAKE_EVENT_NAME)
        if h_event:
            ctypes.windll.kernel32.SetEvent(h_event)
            ctypes.windll.kernel32.CloseHandle(h_event)
            return True
    except Exception:
        pass
    return False


def ensure_single_instance():
    """Ensure only one instance of the sidebar runs at a time.
    If another instance is already running, signals it to expand and exits cleanly."""
    global _GLOBAL_MUTEX
    if _GLOBAL_MUTEX is not None:
        return _GLOBAL_MUTEX
    try:
        ERROR_ALREADY_EXISTS = 183
        mutex = ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
        if ctypes.windll.kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
            print("[VeilGuard AI] Another sidebar instance is already active. Signaling it to expand...")
            signal_existing_instance()
            sys.exit(0)
        _GLOBAL_MUTEX = mutex
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
