"""Unit tests for Scanner and deterministic overlap resolution."""

import pytest
from veilguard_engine.models import Category, Finding
from veilguard_engine.scanner import Scanner, resolve_overlaps
from tests.engine.fixtures.synthetic_dev_data import SYNTHETIC_AADHAAR_VALID_1


def test_aadhaar_overrides_presidio_phone_with_also_detected_as():
    """Verify checksum-validated IN_AADHAAR overrides Presidio PHONE_NUMBER and populates also_detected_as."""
    # Presidio might detect a 12-digit number as PHONE_NUMBER
    finding_presidio = Finding(
        id="raw_1",
        category=Category.PII,
        entity_type="PHONE_NUMBER",
        start=10,
        end=22,
        score=0.40,
        detector="presidio",
        rule_id="presidio.phone_number",
        validated=None,
        reason="Presidio pattern match",
        also_detected_as=[],
    )

    # IndiaDetector detects same span with Verhoeff validation
    finding_aadhaar = Finding(
        id="raw_2",
        category=Category.GOVERNMENT_ID,
        entity_type="IN_AADHAAR",
        start=10,
        end=22,
        score=0.98,
        detector="india_detector",
        rule_id="IN_AADHAAR.verhoeff.v1",
        validated=True,
        reason="Validated Aadhaar number",
        also_detected_as=[],
    )

    resolved = resolve_overlaps([finding_presidio, finding_aadhaar])

    assert len(resolved) == 1
    winner = resolved[0]
    assert winner.entity_type == "IN_AADHAAR"
    assert winner.id == "f1"
    assert "PHONE_NUMBER" in winner.also_detected_as


def test_scanner_end_to_end_ordering_and_ids():
    """Verify scanner resolves multiple entities, sorts by start offset, and numbers f1, f2, f3."""
    scanner = Scanner()
    text = (
        f"Customer Aadhaar {SYNTHETIC_AADHAAR_VALID_1} has phone 9876543210 "
        "and email user@example.org."
    )
    response = scanner.scan(text)

    findings = response.findings
    assert len(findings) >= 3

    # Check stable sequential IDs and offset sorting
    for idx, f in enumerate(findings, start=1):
        assert f.id == f"f{idx}"
        if idx > 1:
            assert findings[idx - 1].start >= findings[idx - 2].start

    # Check latency recorded
    assert response.stats.latency_ms > 0
    assert response.stats.text_length == len(text)
