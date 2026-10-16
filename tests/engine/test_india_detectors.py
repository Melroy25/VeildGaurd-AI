"""Unit tests for IndiaDetector with positive matches and hard negatives."""

import pytest
from veilguard_engine.detectors.india import IndiaDetector
from tests.engine.fixtures.markup import parse_markup
from tests.engine.fixtures.synthetic_dev_data import (
    SYNTHETIC_AADHAAR_INVALID,
    SYNTHETIC_AADHAAR_VALID_1,
    SYNTHETIC_GSTIN_VALID,
    SYNTHETIC_IFSC_VALID,
    SYNTHETIC_MOBILE_VALID_1,
    SYNTHETIC_PAN_VALID_PERSON,
    SYNTHETIC_UPI_VALID_1,
)


@pytest.fixture
def detector():
    return IndiaDetector()


def test_india_positive_matches_with_exact_spans(detector):
    """Verify IndiaDetector detects Aadhaar, PAN, GSTIN, IFSC, Mobile, UPI, and Bank Account with exact spans."""
    raw = (
        f"Aadhaar is [[IN_AADHAAR|{SYNTHETIC_AADHAAR_VALID_1}]], "
        f"PAN is [[IN_PAN|{SYNTHETIC_PAN_VALID_PERSON}]], "
        f"GST is [[IN_GSTIN|{SYNTHETIC_GSTIN_VALID}]], "
        f"IFSC is [[IN_IFSC|{SYNTHETIC_IFSC_VALID}]], "
        f"phone is [[IN_MOBILE|{SYNTHETIC_MOBILE_VALID_1}]], "
        f"pay via [[UPI_ID|{SYNTHETIC_UPI_VALID_1}]], "
        f"and account number [[IN_BANK_ACCOUNT|123456789012]]."
    )
    clean_text, expected_spans = parse_markup(raw)
    findings = detector.detect(clean_text)

    # Sort both by start
    expected_spans.sort(key=lambda s: s.start)
    findings.sort(key=lambda f: f.start)

    assert len(findings) == len(expected_spans), f"Expected {len(expected_spans)} findings, got {len(findings)}"

    for finding, expected in zip(findings, expected_spans):
        assert finding.entity_type == expected.entity_type
        assert finding.start == expected.start
        assert finding.end == expected.end
        assert clean_text[finding.start : finding.end] == expected.value
        # Rule 7 Invariant: reason must not contain the sensitive value
        assert expected.value not in finding.reason


def test_hard_negatives_for_indian_identifiers(detector):
    """Assert non-sensitive text and malformed identifiers are NOT flagged.

    Hard negatives required by Section 8:
    - 12-digit number with invalid checksum (not an Aadhaar)
    - Order ID or serial number (not a mobile number)
    - Currency amount like 1234567890.00
    - Standard email with dot in domain (not a UPI VPA)
    - Long numeric sequence without bank account context word
    """
    hard_negatives_text = (
        f"Invoice reference 1234567890.00 for order {SYNTHETIC_AADHAAR_INVALID} was processed. "
        "Contact support at user.name@domain.co.in or view ticket 987654321098765. "
        "Total revenue reached 9876543210.50 rupees."
    )

    findings = detector.detect(hard_negatives_text)

    # Filter out findings:
    # 1. Invalid Aadhaar must NOT be flagged as IN_AADHAAR
    assert not any(f.entity_type == "IN_AADHAAR" for f in findings)

    # 2. Decimal numbers (1234567890.00) must NOT be flagged as IN_MOBILE or IN_BANK_ACCOUNT
    assert not any("1234567890.00" == hard_negatives_text[f.start:f.end] for f in findings)

    # 3. user.name@domain.co.in must NOT be flagged as UPI_ID
    assert not any(f.entity_type == "UPI_ID" for f in findings)

    # 4. 987654321098765 (no context words like 'account') must NOT be flagged as IN_BANK_ACCOUNT
    assert not any(f.entity_type == "IN_BANK_ACCOUNT" for f in findings)


def test_bank_account_requires_local_context(detector):
    """Verify bank account numbers require context keywords (e.g. 'account no', 'a/c') to be flagged."""
    # Without context word: should NOT be flagged
    no_context = "The tracking reference is 50100234567890 in the system."
    assert not any(f.entity_type == "IN_BANK_ACCOUNT" for f in detector.detect(no_context))

    # With context word: MUST be flagged
    with_context = "Please transfer the payment to a/c 50100234567890 as discussed."
    findings = detector.detect(with_context)
    acc_findings = [f for f in findings if f.entity_type == "IN_BANK_ACCOUNT"]
    assert len(acc_findings) == 1
    assert with_context[acc_findings[0].start : acc_findings[0].end] == "50100234567890"
