"""Tests for Sanitizer module asserting all 10 core privacy and consistency invariants."""

import pytest
from veilguard_engine.models import Category, Finding
from veilguard_engine.policy.models import Action, AppliedRule, Decision, PolicyResult
from veilguard_engine.sanitizer.core import Sanitizer, mask_value
from veilguard_engine.sanitizer.models import KnownPlaceholder
from veilguard_engine.utils import utf16_to_codepoint_offset


@pytest.fixture
def sanitizer() -> Sanitizer:
    return Sanitizer()


def _make_policy_result(actions: dict[str, Action]) -> PolicyResult:
    return PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[
            AppliedRule(rule_id="RULE_TEST", reason="Test policy rule", finding_ids=list(actions.keys()))
        ],
        per_finding_actions=actions,
        summary="Test summary",
    )


def test_invariant_1_and_2_sanitized_text_and_byte_identity(sanitizer: Sanitizer) -> None:
    # Text with clear non-sensitive prefix/suffix
    text = "Hello, customer Rahul Sharma has phone 9876543210 today."
    f1 = Finding(
        id="f1",
        category=Category.PII,
        entity_type="PERSON",
        start=16,
        end=28,  # "Rahul Sharma"
        score=0.9,
        detector="test",
        rule_id="r1",
        reason="Detected person",
    )
    f2 = Finding(
        id="f2",
        category=Category.PII,
        entity_type="IN_MOBILE",
        start=39,
        end=49,  # "9876543210"
        score=0.9,
        detector="test",
        rule_id="r2",
        reason="Detected phone",
    )

    policy = _make_policy_result({"f1": Action.PSEUDONYMIZE, "f2": Action.PSEUDONYMIZE})
    res = sanitizer.sanitize(text, [f1, f2], policy)

    # Invariant 1: No original sensitive values appear in sanitized_text
    assert "Rahul Sharma" not in res.sanitized_text
    assert "9876543210" not in res.sanitized_text

    # Invariant 2: Text outside spans is byte-identical
    assert res.sanitized_text.startswith("Hello, customer ")
    assert " has phone " in res.sanitized_text
    assert res.sanitized_text.endswith(" today.")


def test_invariant_3_and_4_offset_slicing_and_round_trip(sanitizer: Sanitizer) -> None:
    text = "Review for Vikram Malhotra and Priya Patel regarding account."
    f1 = Finding(
        id="f1",
        category=Category.PII,
        entity_type="PERSON",
        start=11,
        end=26,  # "Vikram Malhotra"
        score=0.9,
        detector="test",
        rule_id="r1",
        reason="Person",
    )
    f2 = Finding(
        id="f2",
        category=Category.PII,
        entity_type="PERSON",
        start=31,
        end=42,  # "Priya Patel"
        score=0.9,
        detector="test",
        rule_id="r1",
        reason="Person",
    )

    policy = _make_policy_result({"f1": Action.PSEUDONYMIZE, "f2": Action.PSEUDONYMIZE})
    res = sanitizer.sanitize(text, [f1, f2], policy)

    # Invariant 3: Slicing sanitized text with reported UTF-16 offsets yields exact placeholders
    utf16_bytes = res.sanitized_text.encode("utf-16-le")
    vault = {}
    for r in res.replacements:
        extracted = utf16_bytes[r.new_start * 2 : r.new_end * 2].decode("utf-16-le")
        assert extracted == r.placeholder

        # Slice original text with original offsets (as the extension does to build its vault)
        orig_bytes = text.encode("utf-16-le")
        orig_val = orig_bytes[r.original_start * 2 : r.original_end * 2].decode("utf-16-le")
        vault[r.placeholder] = orig_val

    # Invariant 4: Round-trip rehydration restores exact original text
    rehydrated = res.sanitized_text
    for ph, orig in vault.items():
        rehydrated = rehydrated.replace(ph, orig)
    assert rehydrated == text


def test_invariant_5_consistency_and_case_whitespace_folding(sanitizer: Sanitizer) -> None:
    text = "First Rahul Sharma, then rahul   sharma, and lastly Anita Roy."
    # Rahul Sharma at 6:18, rahul   sharma at 25:40, Anita Roy at 53:62
    f1 = Finding(
        id="f1", category=Category.PII, entity_type="PERSON", start=6, end=18, score=0.9, detector="test", rule_id="r1", reason="Person"
    )
    f2 = Finding(
        id="f2", category=Category.PII, entity_type="PERSON", start=25, end=39, score=0.9, detector="test", rule_id="r1", reason="Person"
    )
    f3 = Finding(
        id="f3", category=Category.PII, entity_type="PERSON", start=53, end=62, score=0.9, detector="test", rule_id="r1", reason="Person"
    )

    policy = _make_policy_result({"f1": Action.PSEUDONYMIZE, "f2": Action.PSEUDONYMIZE, "f3": Action.PSEUDONYMIZE})
    res = sanitizer.sanitize(text, [f1, f2, f3], policy)

    # Both instances of Rahul Sharma must map to [PERSON_1]
    assert res.replacements[0].placeholder == "[PERSON_1]"
    assert res.replacements[1].placeholder == "[PERSON_1]"
    # Anita Roy must map to [PERSON_2]
    assert res.replacements[2].placeholder == "[PERSON_2]"


def test_invariant_6_known_placeholders_seeding(sanitizer: Sanitizer) -> None:
    text = "Follow up with Rahul Sharma and new contact Deepa."
    f1 = Finding(id="f1", category=Category.PII, entity_type="PERSON", start=15, end=27, score=0.9, detector="test", rule_id="r1", reason="Person")
    f2 = Finding(id="f2", category=Category.PII, entity_type="PERSON", start=44, end=49, score=0.9, detector="test", rule_id="r1", reason="Person")

    # Seed known_placeholders with Rahul Sharma already mapped to [PERSON_3]
    known = [
        KnownPlaceholder(entity_type="PERSON", value="rahul sharma", placeholder="[PERSON_3]"),
    ]

    policy = _make_policy_result({"f1": Action.PSEUDONYMIZE, "f2": Action.PSEUDONYMIZE})
    res = sanitizer.sanitize(text, [f1, f2], policy, known_placeholders=known)

    # Reuses [PERSON_3] for Rahul Sharma
    assert res.replacements[0].placeholder == "[PERSON_3]"
    # Continues numbering after highest index: Deepa gets [PERSON_4]
    assert res.replacements[1].placeholder == "[PERSON_4]"


def test_invariant_7_mask_preserves_separators_and_last_4_digits() -> None:
    assert mask_value("5678 9012 3456") == "XXXX XXXX 3456"
    assert mask_value("4532-0000-0000-0009") == "XXXX-XXXX-XXXX-0009"
    assert mask_value("123456789012") == "XXXXXXXX9012"
    assert mask_value("123") == "123"  # <= 4 digits not masked


def test_invariant_8_unicode_and_emoji_offsets(sanitizer: Sanitizer) -> None:
    # Emoji 🚨 (2 UTF-16 units) and Devanagari नमस्ते (BMP characters)
    text = "नमस्ते 🚨 customer Rahul Sharma is registered."
    # Find Rahul Sharma
    start_cp = text.index("Rahul Sharma")
    end_cp = start_cp + len("Rahul Sharma")

    f1 = Finding(
        id="f1", category=Category.PII, entity_type="PERSON", start=start_cp, end=end_cp, score=0.9, detector="test", rule_id="r1", reason="Person"
    )
    policy = _make_policy_result({"f1": Action.PSEUDONYMIZE})
    res = sanitizer.sanitize(text, [f1], policy)

    # Slicing with UTF-16 offsets
    utf16_bytes = res.sanitized_text.encode("utf-16-le")
    r = res.replacements[0]
    extracted = utf16_bytes[r.new_start * 2 : r.new_end * 2].decode("utf-16-le")
    assert extracted == "[PERSON_1]"
    assert res.sanitized_text.startswith("नमस्ते 🚨 customer [PERSON_1]")


def test_invariant_9_boundary_and_adjacent_findings(sanitizer: Sanitizer) -> None:
    # Entities at the very beginning and very end
    text = "9876543210 and 8765432109"
    f1 = Finding(id="f1", category=Category.PII, entity_type="IN_MOBILE", start=0, end=10, score=0.9, detector="test", rule_id="r1", reason="Phone")
    f2 = Finding(id="f2", category=Category.PII, entity_type="IN_MOBILE", start=15, end=25, score=0.9, detector="test", rule_id="r1", reason="Phone")

    policy = _make_policy_result({"f1": Action.PSEUDONYMIZE, "f2": Action.PSEUDONYMIZE})
    res = sanitizer.sanitize(text, [f1, f2], policy)

    assert res.sanitized_text == "[PHONE_1] and [PHONE_2]"
    assert res.replacements[0].new_start == 0


def test_invariant_10_rescan_verification_and_placeholder_immunity(sanitizer: Sanitizer) -> None:
    text = "Please contact Rahul Sharma at 9876543210 regarding your account."
    f1 = Finding(id="f1", category=Category.PII, entity_type="PERSON", start=15, end=27, score=0.9, detector="test", rule_id="r1", reason="Person")
    f2 = Finding(id="f2", category=Category.PII, entity_type="IN_MOBILE", start=31, end=41, score=0.9, detector="test", rule_id="r1", reason="Phone")

    policy = _make_policy_result({"f1": Action.PSEUDONYMIZE, "f2": Action.PSEUDONYMIZE})
    res = sanitizer.sanitize(text, [f1, f2], policy)

    # Verification must have executed
    assert res.verification.rescanned is True
    # Generated placeholders [PERSON_1] and [PHONE_1] should not be re-detected as residuals
    assert res.verification.residual_findings == 0
    assert res.verification.residual_finding_types == []
