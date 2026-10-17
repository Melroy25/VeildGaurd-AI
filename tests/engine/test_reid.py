"""Unit tests for quasi-identifiers and re-identification risk (Phase 5 Part C4).

Validates:
- QuasiDetector detection of age, role, org, location, event, gender.
- ReidScorer noisy-OR formula over distinct quasi types.
- ReidReducer iterative reduction prioritizing necessity then weight.
- Target demo sentence:
  'Draft a performance review for the 34-year-old HR manager at Acme\'s Pune office who recently went on maternity leave.'
  VeilGuard flags combination (high risk), generalizes optional/unnecessary details, keeps HR manager.
- Policy integration: high reid level gives redact (company/finance) or require_approval (personal).
"""

import pytest

from veilguard_engine.context.task import TaskProfile
from veilguard_engine.detectors.quasi import QuasiDetector
from veilguard_engine.necessity.resolver import NecessityMatrix
from veilguard_engine.policy import PolicyEvaluator, PolicyRegistry
from veilguard_engine.policy.models import Action, Decision, DestinationTrust
from veilguard_engine.reid import (
    ReidReducer,
    ReidScorer,
    generalize_value,
)
from veilguard_engine.sanitizer import Sanitizer


def test_quasi_detector_extracts_all_types():
    text = (
        "Draft a performance review for the 34-year-old HR manager at Acme's Pune office "
        "who recently went on maternity leave."
    )
    detector = QuasiDetector()
    findings = detector.detect(text)

    types_found = {f.entity_type for f in findings}
    assert "QUASI_AGE" in types_found, "QUASI_AGE should be detected"
    assert "QUASI_ROLE" in types_found, "QUASI_ROLE should be detected"
    assert "QUASI_LOCATION" in types_found, "QUASI_LOCATION should be detected"
    assert "QUASI_EVENT" in types_found, "QUASI_EVENT should be detected"


def test_reid_scorer_noisy_or_math():
    scorer = ReidScorer.get_instance()
    # Distinct types: AGE (0.25), ROLE (0.20)
    # Noisy-OR = 1 - (1 - 0.25)*(1 - 0.20) = 1 - 0.75 * 0.80 = 1 - 0.60 = 0.40
    res = scorer.score_types({"QUASI_AGE", "QUASI_ROLE"})
    assert res.score == 0.40
    assert res.level == "low"

    # With ORG (0.35), LOCATION (0.25), EVENT (0.30):
    # 1 - (1-0.25)*(1-0.20)*(1-0.35)*(1-0.25)*(1-0.30) = 1 - (0.75 * 0.80 * 0.65 * 0.75 * 0.70)
    # = 1 - 0.20475 = 0.79525 -> 0.7953
    all_five = scorer.score_types({
        "QUASI_AGE",
        "QUASI_ROLE",
        "QUASI_ORG",
        "QUASI_LOCATION",
        "QUASI_EVENT",
    })
    assert all_five.score >= 0.79
    assert all_five.level == "high"


def test_generalize_value_rules():
    counters = {}
    assert generalize_value("QUASI_AGE", "34-year-old", counters) == "30s"
    assert generalize_value("QUASI_AGE", "aged 45", counters) == "40s"
    assert generalize_value("QUASI_ORG", "Acme", counters) == "[COMPANY_1]"
    assert generalize_value("QUASI_LOCATION", "Pune", counters) == "[CITY_1]"
    assert generalize_value("QUASI_EVENT", "maternity leave", counters) == "personal leave"
    assert generalize_value("QUASI_ROLE", "HR manager", counters) == "[ROLE_1]"
    assert generalize_value("QUASI_GENDER", "she", counters) == "she"


def test_reducer_prioritizes_necessity_and_preserves_required():
    text = (
        "Draft a performance review for the 34-year-old HR manager at Acme's Pune office "
        "who recently went on maternity leave."
    )
    detector = QuasiDetector()
    findings = detector.detect(text)

    # In draft_document, QUASI_ROLE is required, others optional/unnecessary
    matrix = NecessityMatrix.get_instance()
    per_finding_necessity = {f.id: matrix.resolve("draft_document", f) for f in findings}

    role_findings = [f for f in findings if f.entity_type == "QUASI_ROLE"]
    assert len(role_findings) >= 1
    assert per_finding_necessity[role_findings[0].id] == "required"

    reducer = ReidReducer()
    red_res = reducer.reduce(text, findings, per_finding_necessity, target=0.5)

    assert red_res.level_before == "high"
    assert red_res.score_before >= 0.70
    assert red_res.score_after < 0.50
    assert red_res.level_after in ("low", "medium")

    # HR manager (QUASI_ROLE) was NOT generalized
    assert role_findings[0].id not in red_res.applied
    assert role_findings[0].id not in red_res.generalizations


def test_target_demo_sanitization_output():
    """Verify target demo prompt end-to-end:
    'Draft a performance review for the 34-year-old HR manager at Acme\'s Pune office who recently went on maternity leave.'
    """
    text = (
        "Draft a performance review for the 34-year-old HR manager at Acme's Pune office "
        "who recently went on maternity leave."
    )
    detector = QuasiDetector()
    findings = detector.detect(text)

    scorer = ReidScorer.get_instance()
    reid_res = scorer.score_findings(findings)
    assert reid_res.level == "high"

    # Evaluate against company policy with reid_level='high'
    registry = PolicyRegistry()
    profile = registry.get_profile("company")
    policy_res = PolicyEvaluator.evaluate(
        findings=findings,
        source="prompt",
        destination_trust=DestinationTrust.STANDARD,
        profile=profile,
        reid_level=reid_res.level,
    )
    assert policy_res.decision == Decision.REDACT

    # Reducer runs to choose which quasi findings to generalize
    matrix = NecessityMatrix.get_instance()
    per_finding_necessity = {f.id: matrix.resolve("draft_document", f) for f in findings}
    reducer = ReidReducer()
    red_res = reducer.reduce(text, findings, per_finding_necessity, target=0.5)

    # Apply generalizations to per_finding_actions
    for fid in red_res.applied:
        policy_res.per_finding_actions[fid] = Action.GENERALIZE

    sanitizer = Sanitizer(role_placeholders=True)
    san_res = sanitizer.sanitize(
        text=text,
        findings=findings,
        policy_result=policy_res,
        generalizations=red_res.generalizations,
    )

    sanitized = san_res.sanitized_text
    # 34-year-old -> 30s
    assert "34-year-old" not in sanitized
    assert "30s" in sanitized
    # HR manager is kept (required role)
    assert "HR manager" in sanitized
    # Acme -> [COMPANY_1]
    assert "Acme" not in sanitized
    assert "[COMPANY_1]" in sanitized
    # maternity leave -> personal leave
    assert "maternity leave" not in sanitized
    assert "personal leave" in sanitized
