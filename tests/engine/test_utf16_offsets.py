"""Tests for UTF-16 code unit offset conversion in the API layer."""

from fastapi.testclient import TestClient
from veilguard_engine.models import Finding
from veilguard_engine.security import ACTIVE_API_TOKEN
from veilguard_engine.server import app
from veilguard_engine.utils import (
    codepoint_to_utf16_offset,
    convert_findings_to_utf16,
    utf16_to_codepoint_offset,
)


def test_codepoint_and_utf16_offset_math() -> None:
    # 🚨 is U+1F6A8 (1 code point in Python, 2 code units in UTF-16)
    prefix = "Alert 🚨 "
    assert len(prefix) == 8  # Python code points: 'Alert ' (6) + '🚨' (1) + ' ' (1) = 8
    u16_len = codepoint_to_utf16_offset(prefix, len(prefix))
    assert u16_len == 9  # 6 + 2 + 1 = 9 UTF-16 code units

    # Slicing utf-16-le bytes at (start*2, end*2) matches JavaScript indexing
    encoded = prefix.encode("utf-16-le")
    assert len(encoded) == 18  # 9 units * 2 bytes = 18 bytes

    # Round trip
    cp_len = utf16_to_codepoint_offset(prefix, u16_len)
    assert cp_len == len(prefix)


def test_api_scan_returns_utf16_offsets_with_astral_characters() -> None:
    client = TestClient(app)
    # Astral emoji 🚨 precedes the mobile number
    text = "Important note 🚨🚨 call 9876543210 please"
    # 2 emojis = +2 extra UTF-16 code units compared to Python code points

    resp = client.post(
        "/scan",
        headers={"Authorization": f"Bearer {ACTIVE_API_TOKEN}"},
        json={"text": text, "source": "prompt"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["offset_unit"] == "utf16"

    # Find the IN_MOBILE finding
    findings = [f for f in data["findings"] if f["entity_type"] == "IN_MOBILE"]
    assert len(findings) == 1
    f = findings[0]

    # Verify that slicing the text encoded as UTF-16 code units extracts exactly the mobile number
    utf16_bytes = text.encode("utf-16-le")
    extracted = utf16_bytes[f["start"] * 2 : f["end"] * 2].decode("utf-16-le")
    assert extracted == "9876543210"

    # If code points were mistakenly used as UTF-16 units, it would be misaligned
    cp_start = text.index("9876543210")
    assert f["start"] == cp_start + 2  # shifted by 2 units for the two emoji
