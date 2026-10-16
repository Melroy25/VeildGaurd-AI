"""Test for the project's canonical example prompt."""

import pytest
from veilguard_engine.scanner import Scanner

PROJECT_EXAMPLE_PROMPT = (
    "Analyze customer Rahul Sharma's account, phone number 9876543210, and transaction history. "
    "Identify spending patterns."
)


def test_project_example_prompt_detection():
    """Verify example prompt returns PERSON on name and phone on number with exact spans."""
    scanner = Scanner()
    response = scanner.scan(PROJECT_EXAMPLE_PROMPT)
    findings = response.findings

    # Find PERSON finding
    person_findings = [f for f in findings if f.entity_type == "PERSON"]
    assert len(person_findings) >= 1, "Expected PERSON finding for 'Rahul Sharma'"
    person_f = person_findings[0]
    assert person_f.start == 17
    # Note: spaCy tokenization includes possessive 's in span (end=31), covering "Rahul Sharma's"
    assert person_f.end in (29, 31)

    # Find Phone finding (IN_MOBILE or PHONE_NUMBER)
    phone_findings = [f for f in findings if f.entity_type in ("IN_MOBILE", "PHONE_NUMBER")]
    assert len(phone_findings) == 1, "Expected phone finding for '9876543210'"
    phone_f = phone_findings[0]
    assert phone_f.start == 54
    assert phone_f.end == 64
    assert PROJECT_EXAMPLE_PROMPT[phone_f.start : phone_f.end] == "9876543210"
