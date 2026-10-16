"""Tests for policy evaluation, matrix decisions, precedence, and determinism."""

import pytest
from veilguard_engine.models import Category, Finding
from veilguard_engine.policy.evaluator import PolicyEvaluator
from veilguard_engine.policy.loader import PolicyRegistry
from veilguard_engine.policy.models import (
    DECISION_OPTIONS_MAP,
    Action,
    Decision,
    DestinationTrust,
)


@pytest.fixture(scope="module")
def registry() -> PolicyRegistry:
    return PolicyRegistry()


def _make_finding(
    fid: str,
    entity_type: str,
    category: Category,
    score: float = 0.9,
    validated: bool = True,
    start: int = 0,
    end: int = 10,
) -> Finding:
    return Finding(
        id=fid,
        category=category,
        entity_type=entity_type,
        start=start,
        end=end,
        score=score,
        detector="test",
        rule_id="test.rule",
        validated=validated,
        reason="Test finding.",
    )


def test_matrix_secrets_blocked_in_all_profiles(registry: PolicyRegistry) -> None:
    secret_f = _make_finding("f1", "AWS_ACCESS_KEY", Category.SECRET, score=0.95)

    for prof_name in ["personal", "company", "finance"]:
        profile = registry.get_profile(prof_name)
        res = PolicyEvaluator.evaluate([secret_f], "prompt", DestinationTrust.STANDARD, profile)
        assert res.decision == Decision.BLOCK
        assert res.per_finding_actions.get("f1") == Action.REMOVE
        assert res.options == DECISION_OPTIONS_MAP[Decision.BLOCK]


def test_matrix_person_alone_allowed(registry: PolicyRegistry) -> None:
    person_f = _make_finding("f1", "PERSON", Category.PII, score=0.85)

    for prof_name in ["personal", "company", "finance"]:
        profile = registry.get_profile(prof_name)
        res = PolicyEvaluator.evaluate([person_f], "prompt", DestinationTrust.STANDARD, profile)
        assert res.decision == Decision.ALLOW
        assert res.per_finding_actions.get("f1") == Action.KEEP
        assert res.options == ["send_original"]


def test_matrix_person_combined_with_mobile_redacts_both(registry: PolicyRegistry) -> None:
    person_f = _make_finding("f1", "PERSON", Category.PII, score=0.85, start=0, end=12)
    mobile_f = _make_finding("f2", "IN_MOBILE", Category.PII, score=0.90, start=20, end=30)

    for prof_name in ["personal", "company", "finance"]:
        profile = registry.get_profile(prof_name)
        res = PolicyEvaluator.evaluate([person_f, mobile_f], "prompt", DestinationTrust.STANDARD, profile)
        assert res.decision == Decision.REDACT
        # Both must be pseudonymized per also_apply_to_requires
        assert res.per_finding_actions.get("f1") == Action.PSEUDONYMIZE
        assert res.per_finding_actions.get("f2") == Action.PSEUDONYMIZE


def test_matrix_mobile_alone_profile_differences(registry: PolicyRegistry) -> None:
    mobile_f = _make_finding("f1", "IN_MOBILE", Category.PII, score=0.90)

    # Personal: require_approval
    res_personal = PolicyEvaluator.evaluate(
        [mobile_f], "prompt", DestinationTrust.STANDARD, registry.get_profile("personal")
    )
    assert res_personal.decision == Decision.REQUIRE_APPROVAL
    assert res_personal.per_finding_actions.get("f1") == Action.PSEUDONYMIZE
    assert res_personal.options == ["send_sanitized", "send_original_confirmed", "edit", "cancel"]

    # Company: redact
    res_company = PolicyEvaluator.evaluate(
        [mobile_f], "prompt", DestinationTrust.STANDARD, registry.get_profile("company")
    )
    assert res_company.decision == Decision.REDACT
    assert res_company.per_finding_actions.get("f1") == Action.PSEUDONYMIZE

    # Finance: redact
    res_finance = PolicyEvaluator.evaluate(
        [mobile_f], "prompt", DestinationTrust.STANDARD, registry.get_profile("finance")
    )
    assert res_finance.decision == Decision.REDACT


def test_matrix_validated_aadhaar_profile_differences(registry: PolicyRegistry) -> None:
    aadhaar_f = _make_finding("f1", "IN_AADHAAR", Category.GOVERNMENT_ID, score=1.0, validated=True)

    # Company: redact
    res_comp = PolicyEvaluator.evaluate(
        [aadhaar_f], "prompt", DestinationTrust.STANDARD, registry.get_profile("company")
    )
    assert res_comp.decision == Decision.REDACT
    assert res_comp.per_finding_actions.get("f1") == Action.PSEUDONYMIZE

    # Finance: block
    res_fin = PolicyEvaluator.evaluate(
        [aadhaar_f], "prompt", DestinationTrust.STANDARD, registry.get_profile("finance")
    )
    assert res_fin.decision == Decision.BLOCK
    assert res_fin.per_finding_actions.get("f1") == Action.PSEUDONYMIZE


def test_matrix_card_and_bank_account_masked(registry: PolicyRegistry) -> None:
    card_f = _make_finding("f1", "CREDIT_CARD", Category.FINANCIAL, score=0.95)
    acct_f = _make_finding("f2", "IN_BANK_ACCOUNT", Category.FINANCIAL, score=0.85)

    for prof_name in ["personal", "company", "finance"]:
        profile = registry.get_profile(prof_name)
        res = PolicyEvaluator.evaluate([card_f, acct_f], "prompt", DestinationTrust.STANDARD, profile)
        assert res.decision == Decision.REDACT
        assert res.per_finding_actions.get("f1") == Action.MASK
        assert res.per_finding_actions.get("f2") == Action.MASK


def test_matrix_upi_id_pseudonymized(registry: PolicyRegistry) -> None:
    upi_f = _make_finding("f1", "UPI_ID", Category.FINANCIAL, score=0.95)

    for prof_name in ["personal", "company", "finance"]:
        profile = registry.get_profile(prof_name)
        res = PolicyEvaluator.evaluate([upi_f], "prompt", DestinationTrust.STANDARD, profile)
        assert res.decision == Decision.REDACT
        assert res.per_finding_actions.get("f1") == Action.PSEUDONYMIZE


def test_matrix_confidential_watchlist_destination_trust(registry: PolicyRegistry) -> None:
    term_f = _make_finding("f1", "CONFIDENTIAL_TERM", Category.CONFIDENTIAL, score=0.95)

    # Company on untrusted destination -> block
    res_untrusted = PolicyEvaluator.evaluate(
        [term_f], "prompt", DestinationTrust.UNTRUSTED, registry.get_profile("company")
    )
    assert res_untrusted.decision == Decision.BLOCK
    assert res_untrusted.per_finding_actions.get("f1") == Action.REMOVE

    # Company on standard destination -> require_approval
    res_standard = PolicyEvaluator.evaluate(
        [term_f], "prompt", DestinationTrust.STANDARD, registry.get_profile("company")
    )
    assert res_standard.decision == Decision.REQUIRE_APPROVAL
    assert res_standard.per_finding_actions.get("f1") == Action.PSEUDONYMIZE

    # Finance on standard destination -> block
    res_fin = PolicyEvaluator.evaluate(
        [term_f], "prompt", DestinationTrust.STANDARD, registry.get_profile("finance")
    )
    assert res_fin.decision == Decision.BLOCK


def test_strongest_decision_and_action_precedence(registry: PolicyRegistry) -> None:
    # A mix of mobile (redact), person (alone=allow, combined=redact), and secret (block, remove)
    person_f = _make_finding("f1", "PERSON", Category.PII, score=0.85)
    mobile_f = _make_finding("f2", "IN_MOBILE", Category.PII, score=0.90)
    secret_f = _make_finding("f3", "AWS_ACCESS_KEY", Category.SECRET, score=0.95)

    res = PolicyEvaluator.evaluate(
        [person_f, mobile_f, secret_f], "prompt", DestinationTrust.STANDARD, registry.get_profile("company")
    )
    # Block is strongest decision
    assert res.decision == Decision.BLOCK
    # Secret gets remove (strongest action)
    assert res.per_finding_actions.get("f3") == Action.REMOVE
    # Person and mobile get pseudonymize
    assert res.per_finding_actions.get("f1") == Action.PSEUDONYMIZE
    assert res.per_finding_actions.get("f2") == Action.PSEUDONYMIZE


def test_evaluation_determinism(registry: PolicyRegistry) -> None:
    person_f = _make_finding("f1", "PERSON", Category.PII, score=0.85)
    mobile_f = _make_finding("f2", "IN_MOBILE", Category.PII, score=0.90)
    profile = registry.get_profile("company")

    res1 = PolicyEvaluator.evaluate([person_f, mobile_f], "prompt", DestinationTrust.STANDARD, profile)
    res2 = PolicyEvaluator.evaluate([person_f, mobile_f], "prompt", DestinationTrust.STANDARD, profile)

    assert res1.decision == res2.decision
    assert res1.options == res2.options
    assert res1.per_finding_actions == res2.per_finding_actions
    assert res1.summary == res2.summary
    assert len(res1.applied_rules) == len(res2.applied_rules)


def test_allow_person_alone_not_applied_when_combined(registry: PolicyRegistry) -> None:
    """ALLOW_PERSON_ALONE must not be in applied_rules when person is combined with phone/email/id."""
    person_f = _make_finding("f1", "PERSON", Category.PII, score=0.85, start=0, end=12)
    mobile_f = _make_finding("f2", "IN_MOBILE", Category.PII, score=0.90, start=20, end=30)

    for prof_name in ["personal", "company", "finance"]:
        profile = registry.get_profile(prof_name)
        res = PolicyEvaluator.evaluate([person_f, mobile_f], "prompt", DestinationTrust.STANDARD, profile)
        applied_rule_ids = [r.rule_id for r in res.applied_rules]
        assert "ALLOW_PERSON_ALONE" not in applied_rule_ids
        assert "PII_COMBINATION_PERSON" in applied_rule_ids

