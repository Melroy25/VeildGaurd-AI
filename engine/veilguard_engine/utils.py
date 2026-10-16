"""Utility functions for VeilGuard AI Engine."""

from typing import List
from veilguard_engine.models import Finding


def codepoint_to_utf16_offset(text: str, cp_offset: int) -> int:
    """Convert a Unicode code-point offset in text to a UTF-16 code-unit offset.

    JavaScript strings index by UTF-16 code units, whereas Python strings
    index by Unicode code points. Characters outside the Basic Multilingual
    Plane (U+10000 to U+10FFFF, e.g. emoji) occupy 1 code point in Python
    but 2 code units (surrogate pair) in JavaScript.
    """
    if cp_offset <= 0:
        return 0
    if cp_offset >= len(text):
        return len(text.encode("utf-16-le")) // 2
    return len(text[:cp_offset].encode("utf-16-le")) // 2


def utf16_to_codepoint_offset(text: str, utf16_offset: int) -> int:
    """Convert a UTF-16 code-unit offset to a Unicode code-point offset."""
    if utf16_offset <= 0:
        return 0
    curr_u16 = 0
    for i, c in enumerate(text):
        if curr_u16 >= utf16_offset:
            return i
        curr_u16 += 2 if ord(c) > 0xFFFF else 1
    return len(text)


def convert_findings_to_utf16(findings: List[Finding], text: str) -> List[Finding]:
    """Return a new list of findings with start and end converted to UTF-16 code-unit offsets."""
    converted: List[Finding] = []
    for f in findings:
        f_copy = f.model_copy()
        f_copy.start = codepoint_to_utf16_offset(text, f.start)
        f_copy.end = codepoint_to_utf16_offset(text, f.end)
        converted.append(f_copy)
    return converted
