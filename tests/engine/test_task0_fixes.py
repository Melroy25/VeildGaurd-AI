"""Tests for Task 0 fixes: span normalization, possessive handling, tightened placeholder ignore, and summary specificity."""

from fastapi.testclient import TestClient
from veilguard_engine.models import Category, Finding
from veilguard_engine.policy.evaluator import PolicyEvaluator
from veilguard_engine.policy.loader import PolicyRegistry
from veilguard_engine.policy.models import DestinationTrust
from veilguard_engine.sanitizer.core import Sanitizer, is_generated_placeholder
from veilguard_engine.scanner import Scanner, normalize_finding_span
from veilguard_engine.security import ACTIVE_API_TOKEN
from veilguard_engine.server import app

client = TestClient(app)


def test_span_normalization_possessives_and_punctuation() -> None:
    # 1. Straight apostrophe possessive
    text1 = "Customer Rahul Sharma's file."
    f1 = Finding(
        id="f1", category=Category.PII, entity_type="PERSON", start=9, end=23, score=0.9, detector="test", rule_id="r1", reason="Person"
    )
    n1 = normalize_finding_span(f1, text1)
    assert text1[n1.start : n1.end] == "Rahul Sharma"
    assert n1.end == 21

    # 2. Curly apostrophe possessive
    text2 = "Customer Rahul Sharma’s file."
    f2 = Finding(
        id="f2", category=Category.PII, entity_type="PERSON", start=9, end=23, score=0.9, detector="test", rule_id="r1", reason="Person"
    )
    n2 = normalize_finding_span(f2, text2)
    assert text2[n2.start : n2.end] == "Rahul Sharma"

    # 3. Trailing comma
    text3 = "Hello Rahul Sharma, how are you?"
    f3 = Finding(
        id="f3", category=Category.PII, entity_type="PERSON", start=6, end=19, score=0.9, detector="test", rule_id="r1", reason="Person"
    )
    n3 = normalize_finding_span(f3, text3)
    assert text3[n3.start : n3.end] == "Rahul Sharma"

    # 4. Enclosed in parentheses
    text4 = "Lead developer (Rahul Sharma) arrived."
    f4 = Finding(
        id="f4", category=Category.PII, entity_type="PERSON", start=15, end=29, score=0.9, detector="test", rule_id="r1", reason="Person"
    )
    n4 = normalize_finding_span(f4, text4)
    assert text4[n4.start : n4.end] == "Rahul Sharma"

    # 5. Emoji and Devanagari context
    text5 = "🚨 (Rahul Sharma's) नमस्ते account"
    # Find Rahul Sharma's span
    start_pos = text5.index("(Rahul")
    end_pos = text5.index(")") + 1
    f5 = Finding(
        id="f5", category=Category.PII, entity_type="PERSON", start=start_pos, end=end_pos, score=0.9, detector="test", rule_id="r1", reason="Person"
    )
    n5 = normalize_finding_span(f5, text5)
    assert text5[n5.start : n5.end] == "Rahul Sharma"


def test_example_prompt_preserves_possessive_s_in_sanitized_text() -> None:
    prompt = "Analyze customer Rahul Sharma's account, phone number 9876543210, and transaction history. Identify spending patterns."

    resp = client.post(
        "/analyze",
        headers={"Authorization": f"Bearer {ACTIVE_API_TOKEN}"},
        json={
            "text": prompt,
            "source": "prompt",
            "destination": "127.0.0.1",
            "profile": "company",
        },
    )
    assert resp.status_code == 200
    data = resp.json()

    # Exact expected sanitized text preserving 's (with role-aware placeholder CUSTOMER_1)
    expected_sanitized_customer = (
        "Analyze customer [CUSTOMER_1]'s account, phone number [PHONE_1], and transaction history. Identify spending patterns."
    )
    expected_sanitized_person = (
        "Analyze customer [PERSON_1]'s account, phone number [PHONE_1], and transaction history. Identify spending patterns."
    )
    assert data["sanitization"]["sanitized_text"] in (expected_sanitized_customer, expected_sanitized_person)


def test_same_placeholder_for_possessive_and_non_possessive() -> None:
    text = "We reviewed Rahul Sharma and later Rahul Sharma's account, call 9876543210."
    scanner = Scanner()
    res = scanner.scan(text)

    # Both person findings should have their spans normalized to 'Rahul Sharma'
    person_findings = [f for f in res.findings if f.entity_type == "PERSON"]
    assert len(person_findings) == 2
    for f in person_findings:
        assert text[f.start : f.end] == "Rahul Sharma"

    # Send to /analyze and verify both map to [PERSON_1]
    resp = client.post(
        "/analyze",
        headers={"Authorization": f"Bearer {ACTIVE_API_TOKEN}"},
        json={
            "text": text,
            "source": "prompt",
            "profile": "company",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    reps = data["sanitization"]["replacements"]
    person_reps = [r for r in reps if r["placeholder"].startswith("[PERSON")]
    assert len(person_reps) == 2
    assert person_reps[0]["placeholder"] == "[PERSON_1]"
    assert person_reps[1]["placeholder"] == "[PERSON_1]"


def test_tightened_placeholder_ignore_rule() -> None:
    # 1. Valid generated placeholders
    assert is_generated_placeholder("[PERSON_1]") is True
    assert is_generated_placeholder("[PHONE_12]") is True
    assert is_generated_placeholder("[SECRET_REMOVED]") is True
    assert is_generated_placeholder("[AADHAAR_3]") is True

    # 2. Bracketed secrets or invalid formats must NOT be ignored
    assert is_generated_placeholder("[AKIAIOSFODNN7EXAMPLE]") is False
    assert is_generated_placeholder("[UNKNOWN_1]") is False
    assert is_generated_placeholder("[PERSON]") is False

    # 3. Re-scan test with bracketed synthetic secret
    sanitizer = Sanitizer()
    text_with_bracketed_secret = "Config key is [AKIAIOSFODNN7EXAMPLE] in production."
    verification = sanitizer._verify_sanitized(text_with_bracketed_secret)
    # The bracketed AWS key must still be detected as a residual finding!
    assert verification.residual_findings > 0
    assert "AWS_ACCESS_KEY" in verification.residual_finding_types


def test_improved_summary_prioritizes_combination_rule() -> None:
    registry = PolicyRegistry()
    profile = registry.get_profile("company")

    f1 = Finding(
        id="f1", category=Category.PII, entity_type="PERSON", start=0, end=12, score=0.85, detector="test", rule_id="r1", reason="Person"
    )
    f2 = Finding(
        id="f2", category=Category.PII, entity_type="IN_MOBILE", start=20, end=30, score=0.90, detector="test", rule_id="r2", reason="Phone"
    )

    res = PolicyEvaluator.evaluate([f1, f2], "prompt", DestinationTrust.STANDARD, profile)
    assert res.decision.value == "redact"
    # Primary rule in summary must be the combination rule PII_COMBINATION_PERSON
    assert "PII_COMBINATION_PERSON" in res.summary
    assert "rule PII_COMBINATION_PERSON" in res.summary
    assert "REDACT_DIRECT_CONTACT" in res.summary
