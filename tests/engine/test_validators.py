"""Unit tests for mathematical and structural validators."""

import pytest
from veilguard_engine.detectors.validators import (
    compute_gstin_check_digit,
    generate_verhoeff_check_digit,
    validate_gstin,
    validate_pan,
    validate_verhoeff,
)
from tests.engine.fixtures.synthetic_dev_data import (
    SYNTHETIC_AADHAAR_INVALID,
    SYNTHETIC_AADHAAR_VALID_1,
    SYNTHETIC_GSTIN_INVALID,
    SYNTHETIC_GSTIN_VALID,
    SYNTHETIC_PAN_INVALID_ENTITY,
    SYNTHETIC_PAN_INVALID_LENGTH,
    SYNTHETIC_PAN_VALID_COMPANY,
    SYNTHETIC_PAN_VALID_PERSON,
)


def test_verhoeff_known_test_vector():
    """Verify Verhoeff checksum algorithm against standard published vector: 236 -> 3."""
    check_digit = generate_verhoeff_check_digit("236")
    assert check_digit == 3, f"Expected check digit 3 for 236, got {check_digit}"
    assert validate_verhoeff("2363") is True
    assert validate_verhoeff("2364") is False


def test_verhoeff_synthetic_aadhaar_validation():
    """Verify synthetic Aadhaar numbers validate, while tampered numbers fail."""
    assert validate_verhoeff(SYNTHETIC_AADHAAR_VALID_1) is True
    assert validate_verhoeff(SYNTHETIC_AADHAAR_INVALID) is False
    assert validate_verhoeff("1234") is False
    assert validate_verhoeff("abcdef") is False


def test_pan_structure_and_entity_status():
    """Verify PAN structure validation including valid 4th character status codes."""
    # Valid status codes
    assert validate_pan(SYNTHETIC_PAN_VALID_PERSON) is True  # 'P' for Person
    assert validate_pan(SYNTHETIC_PAN_VALID_COMPANY) is True  # 'C' for Company

    # Invalid status codes & lengths
    assert validate_pan(SYNTHETIC_PAN_INVALID_ENTITY) is False  # 'X' is invalid
    assert validate_pan(SYNTHETIC_PAN_INVALID_LENGTH) is False  # 9 chars
    assert validate_pan("1234567890") is False
    assert validate_pan("") is False


def test_gstin_mod36_checksum():
    """Verify GSTIN structure, PAN embedding, and Mod-36 checksum validation."""
    assert validate_gstin(SYNTHETIC_GSTIN_VALID) is True
    assert validate_gstin(SYNTHETIC_GSTIN_INVALID) is False

    # Invalid state code (999 or 00)
    invalid_state = "00" + SYNTHETIC_PAN_VALID_COMPANY + "1Z5"
    assert validate_gstin(invalid_state) is False

    # Invalid embedded PAN
    invalid_pan_gstin = "27ABCXE1234F1Z5"
    assert validate_gstin(invalid_pan_gstin) is False
