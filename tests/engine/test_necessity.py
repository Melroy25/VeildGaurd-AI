"""Unit tests for Necessity Matrix & Invariant Adjustments (Phase 5 Part C2).

Tests each invariant explicitly:
1. Invariant 1: Necessity never weakens a BLOCK decision.
2. Invariant 1: Necessity never keeps a SECRET.
3. Invariant 1: Blocked Government IDs stay blocked.
4. Invariant 2: Non-secret required findings become Action.KEEP, decision rises to
   at least REQUIRE_APPROVAL, and trade-offs are logged.
5. Invariant 3: Optional and unnecessary findings retain policy actions.
6. Utility Assessment: basis ('task_aware' vs 'type_only') and may_change_result ('low', 'possible', 'high').
"""

import pytest

from veilguard_engine.context.task import TaskProfile
from veilguard_engine.models import Category
from veilguard_engine.necessity.resolver import (
    NecessityMatrix,
    evaluate_necessity,
)
from veilguard_engine.policy.models import Action, Decision, PolicyResult
from veilguard_engine.scanner import Finding


def _make_finding(id_: str, entity_type: str, category: Category, score: float = 0.9) -> Finding:
    return Finding(
        id=id_,
        start=0,
        end=10,
        entity_type=entity_type,
        category=category,
        score=score,
        detector="test_detector",
        rule_id="test.rule.v1",
        reason="test reason",
        validated=True,
    )


def test_invariant_1_never_weakens_block():
    """A policy BLOCK decision must NEVER be weakened to require_approval, redact, or allow."""
    f = _make_finding("f1", "IN_AADHAAR", Category.GOVERNMENT_ID)
    policy_res = PolicyResult(
        decision=Decision.BLOCK,
        options=["edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f1": Action.REMOVE},
        summary="Blocked by security policy",
    )
    task = TaskProfile(type="verify_identifier", confidence="high", evidence=["T_VERIFY_ID_01"])

    res = evaluate_necessity([f], policy_res, task)
    assert res.adjusted_decision == Decision.BLOCK, "BLOCK must never be weakened"
    assert res.adjusted_actions["f1"] == Action.REMOVE, "Action under BLOCK must not be weakened to KEEP"


def test_invariant_1_never_keeps_secret():
    """Secrets must NEVER be marked KEEP, even if a task claims they are required."""
    f = _make_finding("sec1", "AWS_ACCESS_KEY", Category.SECRET)
    policy_res = PolicyResult(
        decision=Decision.BLOCK,
        options=["edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"sec1": Action.REMOVE},
        summary="Secret detected",
    )
    # Even if an adversarial or debug task was used
    task = TaskProfile(type="debug_code", confidence="high", evidence=["T_DEBUG_01"])

    res = evaluate_necessity([f], policy_res, task)
    assert res.adjusted_actions["sec1"] != Action.KEEP
    assert res.adjusted_decision == Decision.BLOCK


def test_invariant_2_required_finding_becomes_keep_and_require_approval():
    """A required non-secret finding whose action was pseudonymize/mask/remove becomes KEEP,
    decision rises to at least REQUIRE_APPROVAL, and trade-off is recorded.
    """
    f = _make_finding("f_aadhaar", "IN_AADHAAR", Category.GOVERNMENT_ID)
    policy_res = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f_aadhaar": Action.MASK},
        summary="Redacted Aadhaar",
    )
    task = TaskProfile(type="verify_identifier", confidence="high", evidence=["T_VERIFY_ID_01", "T_VERIFY_ID_02"])

    res = evaluate_necessity([f], policy_res, task)
    assert res.per_finding_necessity["f_aadhaar"] == "required"
    assert res.adjusted_actions["f_aadhaar"] == Action.KEEP
    assert res.adjusted_decision == Decision.REQUIRE_APPROVAL
    assert len(res.tradeoffs) == 1
    assert res.tradeoffs[0]["finding_id"] == "f_aadhaar"
    assert "the task needs this detail" in res.tradeoffs[0]["tradeoff"]
    assert "GOVERNMENT_ID" in res.tradeoffs[0]["tradeoff"]


def test_invariant_2_draft_message_recipient_name():
    """Recipient name in draft_message is required -> becomes KEEP with REQUIRE_APPROVAL."""
    f = _make_finding("f_person", "PERSON", Category.PII)
    policy_res = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f_person": Action.PSEUDONYMIZE},
        summary="Redacted person name",
    )
    task = TaskProfile(type="draft_message", confidence="high", evidence=["T_DRAFT_MSG_01"])

    res = evaluate_necessity([f], policy_res, task)
    assert res.per_finding_necessity["f_person"] == "required"
    assert res.adjusted_actions["f_person"] == Action.KEEP
    assert res.adjusted_decision == Decision.REQUIRE_APPROVAL
    assert len(res.tradeoffs) == 1


def test_invariant_3_unnecessary_and_optional_keep_policy_action():
    """Unnecessary and optional findings keep policy actions untouched."""
    f_phone = _make_finding("f_ph", "PHONE_NUMBER", Category.PII)
    f_loc = _make_finding("f_loc", "LOCATION", Category.PII)
    policy_res = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={
            "f_ph": Action.PSEUDONYMIZE,
            "f_loc": Action.PSEUDONYMIZE,
        },
        summary="Redacted contact and location",
    )
    # In analyze_data: phone is unnecessary, location is optional
    task = TaskProfile(type="analyze_data", confidence="high", evidence=["T_ANALYZE_01"])

    res = evaluate_necessity([f_phone, f_loc], policy_res, task)
    assert res.per_finding_necessity["f_ph"] == "unnecessary"
    assert res.per_finding_necessity["f_loc"] == "optional"
    assert res.adjusted_actions["f_ph"] == Action.PSEUDONYMIZE
    assert res.adjusted_actions["f_loc"] == Action.PSEUDONYMIZE
    assert res.adjusted_decision == Decision.REDACT
    assert len(res.tradeoffs) == 0


def test_unknown_task_conservative_behavior():
    """Unknown task treats all findings as optional with type_only basis."""
    f = _make_finding("f1", "PERSON", Category.PII)
    policy_res = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f1": Action.PSEUDONYMIZE},
        summary="Redacted",
    )
    task = TaskProfile(type="unknown", confidence="low", evidence=[])

    res = evaluate_necessity([f], policy_res, task)
    assert res.per_finding_necessity["f1"] == "optional"
    assert res.utility.basis == "type_only"
    assert res.utility.may_change_result == "possible"
    assert res.adjusted_actions["f1"] == Action.PSEUDONYMIZE


def test_utility_may_change_result_levels():
    # Only unnecessary findings altered -> may_change_result == 'low'
    f_phone = _make_finding("f1", "PHONE_NUMBER", Category.PII)
    policy_res = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f1": Action.PSEUDONYMIZE},
        summary="Redacted",
    )
    task = TaskProfile(type="analyze_data", confidence="high", evidence=["T_ANALYZE_01"])
    res = evaluate_necessity([f_phone], policy_res, task)
    assert res.utility.basis == "task_aware"
    assert res.utility.may_change_result == "low"

    # Optional finding altered -> may_change_result == 'possible'
    f_loc = _make_finding("f2", "LOCATION", Category.PII)
    policy_res2 = PolicyResult(
        decision=Decision.REDACT,
        options=["send_sanitized", "edit", "cancel"],
        applied_rules=[],
        per_finding_actions={"f2": Action.PSEUDONYMIZE},
        summary="Redacted",
    )
    res2 = evaluate_necessity([f_loc], policy_res2, task)
    assert res2.utility.may_change_result == "possible"
