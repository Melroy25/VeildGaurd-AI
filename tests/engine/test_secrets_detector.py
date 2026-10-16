"""Unit tests for SecretsDetector."""

import pytest
from veilguard_engine.detectors.secrets import SecretsDetector
from tests.engine.fixtures.markup import parse_markup
from tests.engine.fixtures.synthetic_dev_data import (
    SYNTHETIC_AWS_KEY,
    SYNTHETIC_GITHUB_TOKEN,
    SYNTHETIC_GOOGLE_KEY,
    SYNTHETIC_JWT,
    SYNTHETIC_SLACK_TOKEN,
)


@pytest.fixture
def detector():
    return SecretsDetector()


def test_secrets_detector_vendor_patterns_and_value_spans(detector):
    """Verify SecretsDetector identifies vendor tokens with exact value spans (excluding keys)."""
    raw = (
        f"AWS credential [[AWS_ACCESS_KEY|{SYNTHETIC_AWS_KEY}]], "
        f"GitHub access token [[GITHUB_TOKEN|{SYNTHETIC_GITHUB_TOKEN}]], "
        f"Slack bot [[SLACK_TOKEN|{SYNTHETIC_SLACK_TOKEN}]], "
        f"Google maps key [[GOOGLE_API_KEY|{SYNTHETIC_GOOGLE_KEY}]], "
        f"and session auth [[JWT_TOKEN|{SYNTHETIC_JWT}]]."
    )
    clean_text, expected_spans = parse_markup(raw)
    findings = detector.detect(clean_text)

    expected_spans.sort(key=lambda s: s.start)
    findings.sort(key=lambda f: f.start)

    assert len(findings) == len(expected_spans)

    for finding, expected in zip(findings, expected_spans):
        assert finding.entity_type == expected.entity_type
        assert finding.start == expected.start
        assert finding.end == expected.end
        assert clean_text[finding.start : finding.end] == expected.value
        # Rule 7 Invariant: secret value must NOT appear in reason
        assert expected.value not in finding.reason


def test_generic_assignments_extract_value_only(detector):
    """Verify generic key=value assignments flag ONLY the secret value, not the key name."""
    text = 'Database config: api_key = "SuperSecretKey9988!" and password: "CorrectHorseBattery99"'
    findings = detector.detect(text)

    assert len(findings) == 2
    # Verify exact extracted spans match the values, not 'api_key =' or 'password:'
    values = [text[f.start:f.end] for f in findings]
    assert "SuperSecretKey9988!" in values
    assert "CorrectHorseBattery99" in values
    assert not any("api_key" in val for val in values)
    assert not any("password" in val for val in values)


def test_connection_string_extracts_password_only(detector):
    """Verify database connection URI detection extracts the password span."""
    text = "Connect via postgres://admin_user:P@ssw0rd9988@db.internal.corp:5432/analytics"
    findings = detector.detect(text)

    conn_findings = [f for f in findings if f.entity_type == "CONNECTION_STRING"]
    assert len(conn_findings) == 1
    assert text[conn_findings[0].start : conn_findings[0].end] == "P@ssw0rd9988"


def test_secrets_detector_negatives(detector):
    """Verify normal prose containing words like 'password' or placeholders are not flagged."""
    normal_prose = (
        "Every user should remember that their password must be kept confidential. "
        "Use api_key = None or password = your_password as sample documentation placeholders."
    )
    findings = detector.detect(normal_prose)
    assert len(findings) == 0, f"Expected 0 findings on normal prose, got {findings}"
