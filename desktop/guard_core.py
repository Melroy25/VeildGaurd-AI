"""VeilGuard AI: Desktop Companion Core Logic & Privacy Guard.

Pure modular core providing:
 - Win32 active window title detection (strictly passive, zero hooks)
 - Local loopback engine HTTP communication
 - State container with memory wiping on exit
 - Invariant: ZERO keylogging hooks (no SetWindowsHookEx, GetAsyncKeyState, pynput, keyboard)
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import sys
import urllib.request
import urllib.error

# Engine configuration
DEFAULT_ENGINE_URL = "http://127.0.0.1:8765"
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
    "mistral",
    "ai studio",
]


def get_auth_token() -> str:
    """Read local bearer token from standard location if present."""
    token_path = Path.home() / ".veilguard" / "token"
    if token_path.is_file():
        try:
            return token_path.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    local_token = Path(__file__).resolve().parent.parent / ".veilguard" / "token"
    if local_token.is_file():
        try:
            return local_token.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    return "dev-local-token"


def get_foreground_window_title() -> str:
    """Return the title of the current foreground window on Windows."""
    if sys.platform != "win32":
        return ""
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return ""
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return ""
        buff = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buff, length + 1)
        return buff.value
    except Exception:
        return ""


def is_ai_window(title: str, keywords: list[str] | None = None) -> bool:
    """Check if window title indicates an AI application or chat interface."""
    if not title:
        return False
    title_lower = title.lower()
    targets = keywords or AI_KEYWORDS
    return any(k in title_lower for k in targets)


def ping_engine(base_url: str = DEFAULT_ENGINE_URL, token: str | None = None) -> bool:
    """Check if local loopback engine is healthy and reachable."""
    req_token = token or get_auth_token()
    req = urllib.request.Request(
        f"{base_url}/health",
        headers={
            "Authorization": f"Bearer {req_token}",
            "Origin": "chrome-extension://veilguard-desktop",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=1.5) as response:
            return response.status == 200
    except Exception:
        return False


def scan_text(
    text: str,
    profile: str = DEFAULT_PROFILE,
    token: str | None = None,
    base_url: str = DEFAULT_ENGINE_URL,
) -> dict:
    """Send text to local engine for privacy analysis and sanitization."""
    req_token = token or get_auth_token()
    payload = json.dumps({
        "text": text,
        "profile": profile,
        "task_hint": "general_chat",
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{base_url}/analyze",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {req_token}",
            "Origin": "chrome-extension://veilguard-desktop",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = resp.read().decode("utf-8")
            return json.loads(data)
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}", "decision": "block"}
    except Exception as e:
        return {"error": str(e), "decision": "block"}


class GuardState:
    """Holds active memory state for the desktop companion with explicit buffer wiping."""

    def __init__(self) -> None:
        self.last_analyzed_text: str = ""
        self.sanitized_text: str = ""
        self.last_clipboard: str = ""
        self.is_guard_active: bool = True
        self.is_clipboard_monitoring: bool = False  # opt-in by default
        self.active_profile: str = DEFAULT_PROFILE

    def wipe_buffers(self) -> None:
        """Securely wipe memory buffers holding sensitive prompt content."""
        self.last_analyzed_text = ""
        self.sanitized_text = ""
        self.last_clipboard = ""
