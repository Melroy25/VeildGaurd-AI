"""Unit tests for role-based placeholders (Phase 5 Part C3).

Validates:
- Target demo: 'Analyze customer Rahul Sharma\'s ...' -> 'Analyze customer [CUSTOMER_1]\'s ...'
- Preceding role within 3 tokens mapped correctly.
- Preceding role beyond 3 tokens falls back to PERSON.
- First mention fixes role label for all subsequent mentions of that entity.
- Per-label numbering (CUSTOMER_1, PATIENT_1).
- known_placeholders honored.
- Possessive 's remains outside the placeholder.
- Flag OFF produces standard PERSON_1.
"""

import pytest

from veilguard_engine.models import Category
from veilguard_engine.policy.models import Action, Decision, PolicyResult
from veilguard_engine.sanitizer import Sanitizer
from veilguard_engine.sanitizer.models import KnownPlaceholder
from veilguard_engine.scanner import Finding


def _make_person_finding(id_: str, start: int, end: int) -> Finding:
    return Finding(
        id=id_,
        start=start,
        end=end,
        entity_type="PERSON",
        category=Category.PII,
        score=0.9,
        detector="spacy",
        rule_id="PERSON.spacy.v1",
        reason="Personal name detected",
        validated=True,
    )


def test_target_demo_customer_rahul_sharma():
    text = "Analyze customer Rahul Sharma's account and transaction history."
    # 'Rahul Sharma' is at index 17 to 29
    start = text.index("Rahul Sharma")
    end = start + len("Rahul Sharma")
    f = _make_person_finding("f1", start, end)

    policy_res = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f1": Action.PSEUDONYMIZE},
        summary="Redact person",
    )

    sanitizer = Sanitizer(role_placeholders=True)
    res = sanitizer.sanitize(text, [f], policy_res)

    assert "Analyze customer [CUSTOMER_1]'s account" in res.sanitized_text
    assert "[PERSON_1]" not in res.sanitized_text


def test_flag_off_falls_back_to_person():
    text = "Analyze customer Rahul Sharma's account."
    start = text.index("Rahul Sharma")
    end = start + len("Rahul Sharma")
    f = _make_person_finding("f1", start, end)

    policy_res = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f1": Action.PSEUDONYMIZE},
        summary="Redact person",
    )

    sanitizer = Sanitizer(role_placeholders=False)
    res = sanitizer.sanitize(text, [f], policy_res)

    assert "Analyze customer [PERSON_1]'s account" in res.sanitized_text


def test_role_nouns_mapping():
    roles = [
        ("client", "CLIENT"),
        ("patient", "PATIENT"),
        ("employee", "EMPLOYEE"),
        ("staff", "EMPLOYEE"),
        ("applicant", "CANDIDATE"),
        ("candidate", "CANDIDATE"),
        ("student", "STUDENT"),
        ("user", "USER"),
        ("borrower", "BORROWER"),
        ("tenant", "TENANT"),
        ("member", "MEMBER"),
    ]
    for noun, expected_label in roles:
        text = f"Contact the {noun} Sunita Rao regarding the update."
        start = text.index("Sunita Rao")
        end = start + len("Sunita Rao")
        f = _make_person_finding("f1", start, end)

        policy_res = PolicyResult(
            decision=Decision.REDACT,
            options=["send_sanitized", "edit", "cancel"],
            applied_rules=[],
            per_finding_actions={"f1": Action.PSEUDONYMIZE},
            summary="Redact person",
        )

        sanitizer = Sanitizer(role_placeholders=True)
        res = sanitizer.sanitize(text, [f], policy_res)
        assert f"[{expected_label}_1]" in res.sanitized_text, f"Failed for {noun} -> {expected_label}"


def test_role_within_3_tokens_distance():
    # 1 token away: "customer Rahul Sharma"
    # 2 tokens away: "our customer Rahul Sharma"
    # 3 tokens away: "the new customer Rahul Sharma"
    # 4 tokens away: "the customer from our department Rahul Sharma" (too far)

    cases = [
        ("Review customer Rahul Sharma now.", True, "CUSTOMER"),
        ("Review our customer Rahul Sharma now.", True, "CUSTOMER"),
        ("Review the new customer Rahul Sharma now.", True, "CUSTOMER"),
        ("The customer from our department yesterday met Rahul Sharma now.", False, "PERSON"),
    ]

    for text, should_match, expected_label in cases:
        start = text.index("Rahul Sharma")
        end = start + len("Rahul Sharma")
        f = _make_person_finding("f1", start, end)

        policy_res = PolicyResult(
            decision=Decision.REDACT,
            options=["send_sanitized", "edit", "cancel"],
            applied_rules=[],
            per_finding_actions={"f1": Action.PSEUDONYMIZE},
            summary="Redact person",
        )

        sanitizer = Sanitizer(role_placeholders=True)
        res = sanitizer.sanitize(text, [f], policy_res)
        assert f"[{expected_label}_1]" in res.sanitized_text, f"Failed on: {text}"


def test_first_mention_fixes_label_for_all_mentions():
    text = "Analyze customer Rahul Sharma's history. Also Rahul Sharma requested a refund."
    first_start = text.index("Rahul Sharma")
    first_end = first_start + len("Rahul Sharma")

    second_start = text.rindex("Rahul Sharma")
    second_end = second_start + len("Rahul Sharma")

    f1 = _make_person_finding("f1", first_start, first_end)
    f2 = _make_person_finding("f2", second_start, second_end)

    policy_res = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f1": Action.PSEUDONYMIZE, "f2": Action.PSEUDONYMIZE},
        summary="Redact person",
    )

    sanitizer = Sanitizer(role_placeholders=True)
    res = sanitizer.sanitize(text, [f1, f2], policy_res)

    expected = "Analyze customer [CUSTOMER_1]'s history. Also [CUSTOMER_1] requested a refund."
    assert res.sanitized_text == expected


def test_per_label_numbering():
    text = "Review customer Rahul Sharma and patient Meera Nair for records."
    f1 = _make_person_finding("f1", text.index("Rahul Sharma"), text.index("Rahul Sharma") + len("Rahul Sharma"))
    f2 = _make_person_finding("f2", text.index("Meera Nair"), text.index("Meera Nair") + len("Meera Nair"))

    policy_res = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f1": Action.PSEUDONYMIZE, "f2": Action.PSEUDONYMIZE},
        summary="Redact person",
    )

    sanitizer = Sanitizer(role_placeholders=True)
    res = sanitizer.sanitize(text, [f1, f2], policy_res)

    assert "[CUSTOMER_1]" in res.sanitized_text
    assert "[PATIENT_1]" in res.sanitized_text


def test_known_placeholders_preserved():
    text = "Analyze customer Rahul Sharma's account."
    start = text.index("Rahul Sharma")
    end = start + len("Rahul Sharma")
    f = _make_person_finding("f1", start, end)

    policy_res = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f1": Action.PSEUDONYMIZE},
        summary="Redact person",
    )

    kp = KnownPlaceholder(
        entity_type="PERSON",
        value="Rahul Sharma",
        placeholder="[CUSTOMER_5]",
    )

    sanitizer = Sanitizer(role_placeholders=True)
    res = sanitizer.sanitize(text, [f], policy_res, known_placeholders=[kp])

    assert "Analyze customer [CUSTOMER_5]'s account" in res.sanitized_text
