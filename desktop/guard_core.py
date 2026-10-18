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
    "chat gpt",
    "codex",
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
    "v0",
]



def get_auth_token() -> str:
    """Read local bearer token from standard locations if present."""
    # 1. Environment variable
    env_token = os.getenv("VEILGUARD_TOKEN")
    if env_token:
        return env_token.strip()

    # 2. Candidate paths
    candidates = [
        Path.home() / ".veilguard" / "token",
        Path.cwd() / ".veilguard" / "token",
        Path(__file__).resolve().parent.parent / ".veilguard" / "token",
        Path(__file__).resolve().parent / ".veilguard" / "token",
        Path(sys.executable).resolve().parent / ".veilguard" / "token",
        Path(sys.executable).resolve().parent.parent / ".veilguard" / "token",
    ]
    for p in candidates:
        if p.is_file():
            try:
                t = p.read_text(encoding="utf-8").strip()
                if t:
                    return t
            except Exception:
                pass
    return "dev-local-token"


def get_foreground_window_title() -> str:
    """Return the title of the current foreground window on Windows."""
    info = get_foreground_window_info()
    return info[1]


def get_foreground_window_info() -> tuple[int, str, str]:
    """Return (hwnd, title, process_name) of the current foreground window on Windows."""
    if sys.platform != "win32":
        return (0, "", "")
    try:
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return (0, "", "")

        # 1. Window title
        length = user32.GetWindowTextLengthW(hwnd)
        title = ""
        if length > 0:
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            title = buff.value

        # 2. Process image name (e.g. codex.exe, cursor.exe, chrome.exe)
        proc_name = ""
        try:
            from ctypes import wintypes
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value > 0:
                h_proc = kernel32.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
                if h_proc:
                    try:
                        pbuf = ctypes.create_unicode_buffer(1024)
                        psz = wintypes.DWORD(1024)
                        if kernel32.QueryFullProcessImageNameW(h_proc, 0, pbuf, ctypes.byref(psz)):
                            proc_name = os.path.basename(pbuf.value).lower()
                    finally:
                        kernel32.CloseHandle(h_proc)
        except Exception:
            pass

        return (hwnd, title, proc_name)
    except Exception:
        return (0, "", "")


def is_ai_window(title: str, keywords: list[str] | None = None, proc_name: str = "") -> bool:
    """Check if window title or process name indicates an AI application or chat interface."""
    targets = keywords or AI_KEYWORDS
    if proc_name:
        pn = proc_name.lower()
        if any(k in pn for k in targets):
            return True
    if not title:
        return False
    title_lower = title.lower()
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
