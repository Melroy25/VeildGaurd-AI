"""Known limitations test suite.

Marked with @pytest.mark.xfail(strict=True) so they stay visible in test runs
and fail loudly if model changes inadvertently alter the behavior.
"""

import pytest
from veilguard_engine.scanner import Scanner


@pytest.fixture(scope="module")
def scanner():
    return Scanner()


@pytest.mark.xfail(
    strict=True,
    reason="Known limitation: spaCy en_core_web_sm statistical NER requires capitalization to recognize names and fails on lowercase text.",
)
def test_limitation_lowercase_names_missed_by_small_model(scanner):
    text = "Please reach out to rahul sharma regarding the pending invoice."
    response = scanner.scan(text)
    assert any(f.entity_type == "PERSON" for f in response.findings)


@pytest.mark.xfail(
    strict=True,
    reason="Known limitation: rare or transliterated Indian regional personal names without prominent context tokens are missed by standard en_core_web_sm.",
)
def test_limitation_transliterated_indian_names_missed(scanner):
    text = "Schedule a follow-up review with Subramanian for Monday."
    response = scanner.scan(text)
    assert any(f.entity_type == "PERSON" for f in response.findings)


@pytest.mark.xfail(
    strict=True,
    reason="Known limitation: isolated names in short phrases without grammatical sentence structure lack contextual cues for small statistical NER.",
)
def test_limitation_names_in_short_fragments_missed(scanner):
    text = "rahul sharma"
    response = scanner.scan(text)
    assert any(f.entity_type == "PERSON" for f in response.findings)


@pytest.mark.xfail(
    strict=True,
    reason="Known limitation: Medical conditions, diagnoses (e.g. diabetes), and medications are not detected by general PII/NER models.",
)
def test_limitation_medical_conditions_undetected(scanner):
    text = "My patient John Doe has diabetes and takes medication daily. Their phone number is 9876543210."
    response = scanner.scan(text)
    # This should fail because 'diabetes' or 'medication' is not detected as MEDICAL or HEALTH finding
    assert any(f.entity_type in {"MEDICAL_CONDITION", "DIAGNOSIS", "MEDICATION"} for f in response.findings)

