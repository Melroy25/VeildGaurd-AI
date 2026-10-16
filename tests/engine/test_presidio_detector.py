"""Unit tests for PresidioDetector wrapper."""

import pytest
from veilguard_engine.detectors.presidio_detector import PresidioDetector


@pytest.fixture(scope="module")
def presidio_detector():
    return PresidioDetector()


def test_presidio_flags_standard_entities(presidio_detector):
    """Verify default PresidioDetector flags email, credit card, and person."""
    # Synthetic standard text
    text = (
        "Please send the receipt to customer.support@example.org. "
        "The customer John Doe paid using credit card 4532000000000009."
    )
    findings = presidio_detector.detect(text)

    types = {f.entity_type for f in findings}
    assert "EMAIL_ADDRESS" in types or "EMAIL" in types
    assert "CREDIT_CARD" in types
    # Rule 7 Invariant
    for f in findings:
        matched_substr = text[f.start : f.end]
        assert matched_substr not in f.reason


def test_presidio_unfiltered_mode():
    """Verify entities=None allows unfiltered Presidio recognizers to run (baseline mode)."""
    unfiltered = PresidioDetector(entities=None)
    # Text with date and IP address (date is excluded in default allowlist, but present in unfiltered)
    text = "Server IP 192.168.1.1 accessed on 2026-10-16."
    findings = unfiltered.detect(text)

    types = {f.entity_type for f in findings}
    assert "IP_ADDRESS" in types
    assert "DATE_TIME" in types
