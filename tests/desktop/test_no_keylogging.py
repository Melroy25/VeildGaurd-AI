"""Tests for Desktop Companion: Privacy Invariants and No-Keylogging Guarantee.

Invariants:
 - Zero keylogging: no SetWindowsHookEx, GetAsyncKeyState, pynput, keyboard, or raw input interception.
 - Clipboard monitoring is strictly opt-in and restricted to active AI tool windows.
 - Memory buffers are wiped upon request/shutdown.
"""

from __future__ import annotations

import ast
from pathlib import Path
import pytest

from desktop.guard_core import is_ai_window, GuardState, AI_KEYWORDS


def test_no_prohibited_keylogger_apis():
    """Static AST scan ensuring desktop/ code has zero keylogging hooks or imports."""
    desktop_dir = Path(__file__).resolve().parent.parent.parent / "desktop"
    py_files = list(desktop_dir.glob("*.py"))
    assert len(py_files) >= 1, "Expected python files in desktop directory"

    prohibited_modules = {"pynput", "keyboard"}
    prohibited_functions = {
        "SetWindowsHookEx",
        "SetWindowsHookExA",
        "SetWindowsHookExW",
        "GetAsyncKeyState",
        "GetKeyState",
        "GetKeyboardState",
        "RegisterHotKey",
    }

    for py_file in py_files:
        code = py_file.read_text(encoding="utf-8")
        tree = ast.parse(code, filename=str(py_file))

        for node in ast.walk(tree):
            # Check module imports
            if isinstance(node, ast.Import):
                for alias in node.names:
                    for mod in prohibited_modules:
                        assert not alias.name.startswith(mod), (
                            f"Prohibited module '{mod}' imported in {py_file.name}!"
                        )
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    for mod in prohibited_modules:
                        assert not node.module.startswith(mod), (
                            f"Prohibited module '{mod}' imported in {py_file.name}!"
                        )

            # Check function calls and attribute access
            elif isinstance(node, ast.Attribute):
                assert node.attr not in prohibited_functions, (
                    f"Prohibited Win32 function '{node.attr}' accessed in {py_file.name}!"
                )
            elif isinstance(node, ast.Name):
                assert node.id not in prohibited_functions, (
                    f"Prohibited function '{node.id}' referenced in {py_file.name}!"
                )


def test_ai_window_detection():
    """Verify smart window title detection correctly identifies AI tools vs normal apps."""
    # Positive matches
    assert is_ai_window("ChatGPT") is True
    assert is_ai_window("ChatGPT — Mozilla Firefox") is True
    assert is_ai_window("ChatGPT - OpenAI Desktop App") is True
    assert is_ai_window("Codex") is True
    assert is_ai_window("Codex - Code Assistant") is True
    assert is_ai_window("Claude — Desktop App") is True
    assert is_ai_window("Cursor - main.py - Visual Studio Code") is True
    assert is_ai_window("Microsoft Copilot in Windows") is True
    assert is_ai_window("DeepSeek Chat - Personal") is True
    assert is_ai_window("Gemini - Google Chrome") is True
    assert is_ai_window("Perplexity - Ask Anything") is True

    # Negative matches (regular desktop apps)
    assert is_ai_window("Spotify Free") is False
    assert is_ai_window("Microsoft Excel - Financial_Model.xlsx") is False
    assert is_ai_window("Calculator") is False
    assert is_ai_window("Task Manager") is False
    assert is_ai_window("Slack - General") is False
    assert is_ai_window("") is False


def test_guard_state_buffer_wiping():
    """Verify that GuardState cleanly clears all memory references upon wipe."""
    state = GuardState()
    state.last_analyzed_text = "Patient John Doe with Aadhaar 9999-1111-2222"
    state.sanitized_text = "Patient [PATIENT_1] with Aadhaar [AADHAAR_1]"
    state.last_clipboard = "secret_password_123"

    assert state.last_analyzed_text != ""
    assert state.sanitized_text != ""
    assert state.last_clipboard != ""

    state.wipe_buffers()

    assert state.last_analyzed_text == ""
    assert state.sanitized_text == ""
    assert state.last_clipboard == ""


def test_sidebar_structure():
    """Verify VeilGuardSidebar has the required collapse, focus-out, and geometry methods."""
    from desktop.sidebar_guard import VeilGuardSidebar
    assert hasattr(VeilGuardSidebar, "_on_focus_out")
    assert hasattr(VeilGuardSidebar, "_check_focus_loss")
    assert hasattr(VeilGuardSidebar, "expand")
    assert hasattr(VeilGuardSidebar, "collapse")
    assert hasattr(VeilGuardSidebar, "_do_sanitize")
    assert hasattr(VeilGuardSidebar, "_do_clear")

