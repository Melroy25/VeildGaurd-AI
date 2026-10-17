"""Unit tests for Medical Detector and Health Privacy Policy (Phase 5 Part C5).

Validates:
- MedicalDetector detects conditions, medications, and procedures from clinical lexicon.
- Whole-word, case-insensitive matching.
- Longest-span overlap resolution (e.g. 'type 2 diabetes' over 'diabetes').
- Policy invariant: medical term alone is ALLOW (general health text is not personal data).
- Policy invariant HEALTH_WITH_IDENTITY: identity findings + medical term gives REDACT,
  pseudonymizing identity while keeping medical terms (task utility content).
- Consistent behavior across company, finance, and personal profiles.
- End-to-end sanitization preserving medical terms while pseudonymizing patient/contact details.
"""

import pytest

from veilguard_engine.detectors.medical import MedicalDetector
from veilguard_engine.models import Category
from veilguard_engine.policy import PolicyEvaluator, PolicyRegistry
from veilguard_engine.policy.models import Action, Decision, DestinationTrust
from veilguard_engine.sanitizer import Sanitizer
from veilguard_engine.scanner import Finding, Scanner


def test_medical_detector_categories_and_types():
    detector = MedicalDetector()
    text = (
        "Patient was diagnosed with Type 2 diabetes and hypertension. "
        "Prescribed metformin 500mg and advised chemotherapy if needed."
    )
    findings = detector.detect(text)

    types_found = {f.entity_type for f in findings}
    assert "MEDICAL_CONDITION" in types_found
    assert "MEDICATION" in types_found
    assert "MEDICAL_PROCEDURE" in types_found

    for f in findings:
        assert f.category == Category.MEDICAL
        assert f.score == 0.90
        assert f.detector == "medical"


def test_medical_longest_span_overlap():
    detector = MedicalDetector()
    text = "Patient has type 2 diabetes mellitus."
    findings = detector.detect(text)

    # Should match 'type 2 diabetes' or 'diabetes mellitus', not just 'diabetes'
    assert len(findings) == 1
    span = text[findings[0].start : findings[0].end].lower()
    assert span in ("type 2 diabetes", "diabetes mellitus")


def test_medical_case_insensitive_whole_word():
    detector = MedicalDetector()
    text = "ASTHMA and asthma and asthmaxyz"
    findings = detector.detect(text)

    assert len(findings) == 2
    for f in findings:
        assert text[f.start : f.end].lower() == "asthma"


def test_policy_medical_term_alone_is_allowed():
    """General health text without identity findings is allowed across all profiles."""
    f_condition = Finding(
        id="f1",
        category=Category.MEDICAL,
        entity_type="MEDICAL_CONDITION",
        start=0,
        end=12,
        score=0.90,
        detector="medical",
        rule_id="MEDICAL_CONDITION.lexicon.v1",
        reason="Medical condition detected",
        validated=None,
    )
    f_medication = Finding(
        id="f2",
        category=Category.MEDICAL,
        entity_type="MEDICATION",
        start=20,
        end=29,
        score=0.90,
        detector="medical",
        rule_id="MEDICATION.lexicon.v1",
        reason="Medication detected",
        validated=None,
    )

    registry = PolicyRegistry()
    for profile_name in ("company", "finance", "personal"):
        profile = registry.get_profile(profile_name)
        policy_res = PolicyEvaluator.evaluate(
            findings=[f_condition, f_medication],
            source="prompt",
            destination_trust=DestinationTrust.STANDARD,
            profile=profile,
        )
        assert policy_res.decision == Decision.ALLOW, f"Failed on {profile_name}"
        assert policy_res.per_finding_actions.get("f1", Action.KEEP) == Action.KEEP
        assert policy_res.per_finding_actions.get("f2", Action.KEEP) == Action.KEEP


def test_health_with_identity_redacts_identity_keeps_medical():
    """HEALTH_WITH_IDENTITY rule: pseudonymizes identity findings while keeping medical terms."""
    f_person = Finding(
        id="f_person",
        category=Category.PII,
        entity_type="PERSON",
        start=8,
        end=20,
        score=0.90,
        detector="spacy",
        rule_id="PERSON.spacy.v1",
        reason="Person name",
        validated=True,
    )
    f_phone = Finding(
        id="f_phone",
        category=Category.PII,
        entity_type="IN_MOBILE",
        start=30,
        end=40,
        score=0.95,
        detector="india",
        rule_id="IN_MOBILE.pattern.v1",
        reason="Indian mobile",
        validated=True,
    )
    f_medical = Finding(
        id="f_med",
        category=Category.MEDICAL,
        entity_type="MEDICAL_CONDITION",
        start=50,
        end=58,
        score=0.90,
        detector="medical",
        rule_id="MEDICAL_CONDITION.lexicon.v1",
        reason="Medical condition",
        validated=None,
    )

    registry = PolicyRegistry()
    for profile_name in ("company", "finance", "personal"):
        profile = registry.get_profile(profile_name)
        policy_res = PolicyEvaluator.evaluate(
            findings=[f_person, f_phone, f_medical],
            source="prompt",
            destination_trust=DestinationTrust.STANDARD,
            profile=profile,
        )
        assert policy_res.decision == Decision.REDACT, f"Failed on {profile_name}"
        assert policy_res.per_finding_actions["f_person"] == Action.PSEUDONYMIZE
        assert policy_res.per_finding_actions["f_phone"] == Action.PSEUDONYMIZE
        # Medical term is kept!
        assert policy_res.per_finding_actions.get("f_med", Action.KEEP) == Action.KEEP


def test_end_to_end_patient_discharge_sanitization():
    """End-to-end: Patient Meera Pillai, mobile 9123456780, was diagnosed with Type 2 diabetes."""
    text = (
        "Patient Meera Pillai, mobile 9123456780, was diagnosed with Type 2 diabetes "
        "and prescribed metformin."
    )
    scanner = Scanner(include_medical=True)
    scan_res = scanner.scan(text)

    registry = PolicyRegistry()
    profile = registry.get_profile("company")
    policy_res = PolicyEvaluator.evaluate(
        findings=scan_res.findings,
        source="prompt",
        destination_trust=DestinationTrust.STANDARD,
        profile=profile,
    )

    assert policy_res.decision == Decision.REDACT

    sanitizer = Sanitizer(role_placeholders=True)
    san_res = sanitizer.sanitize(text, scan_res.findings, policy_res)

    sanitized = san_res.sanitized_text
    # Patient name pseudonymized with role
    assert "Meera Pillai" not in sanitized
    assert "[PATIENT_1]" in sanitized
    # Phone pseudonymized
    assert "9123456780" not in sanitized
    assert "[PHONE_1]" in sanitized
    # Medical content strictly preserved
    assert "Type 2 diabetes" in sanitized
    assert "metformin" in sanitized
