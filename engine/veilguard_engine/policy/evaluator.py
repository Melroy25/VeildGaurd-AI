"""Policy evaluation engine implementing deterministic rule matching and decision precedence."""

from typing import Dict, List, Set
from veilguard_engine.models import Finding
from veilguard_engine.policy.models import (
    ACTION_RANKS,
    DECISION_OPTIONS_MAP,
    DECISION_RANKS,
    Action,
    AppliedRule,
    Decision,
    DestinationTrust,
    PolicyProfile,
    PolicyResult,
    RuleCondition,
    RuleSelector,
)


def _matches_selector(
    finding: Finding,
    selector: RuleSelector,
    default_min_score: float,
) -> bool:
    """Check if a finding satisfies a RuleSelector condition."""
    min_score = selector.min_score if selector.min_score is not None else default_min_score
    if finding.score < min_score:
        return False

    if selector.categories and finding.category not in selector.categories:
        return False

    if selector.entity_types and finding.entity_type not in selector.entity_types:
        return False

    if selector.validated is not None and finding.validated != selector.validated:
        return False

    return True


def _matches_condition(
    finding: Finding,
    cond: RuleCondition,
    default_min_score: float,
    source: str,
    destination_trust: DestinationTrust,
) -> bool:
    """Check if a finding and request context satisfy a RuleCondition."""
    # Context checks
    if cond.sources and source not in cond.sources:
        return False

    if cond.destination_trust and destination_trust not in cond.destination_trust:
        return False

    # Finding checks
    min_score = cond.min_score if cond.min_score is not None else default_min_score
    if finding.score < min_score:
        return False

    if cond.categories and finding.category not in cond.categories:
        return False

    if cond.entity_types and finding.entity_type not in cond.entity_types:
        return False

    if cond.validated is not None and finding.validated != cond.validated:
        return False

    return True


class PolicyEvaluator:
    """Evaluates findings against a policy profile and computes deterministic decisions."""

    @staticmethod
    def evaluate(
        findings: List[Finding],
        source: str,
        destination_trust: DestinationTrust,
        profile: PolicyProfile,
    ) -> PolicyResult:
        """Evaluate a list of findings against a PolicyProfile.

        Deterministic: identical findings and context produce identical decisions and actions.
        Precedence:
          Decisions: allow < redact < require_approval < block (strongest wins)
          Actions: keep < pseudonymize < mask < remove (strongest wins per finding)
        """
        current_decision = Decision.ALLOW
        per_finding_actions: Dict[str, Action] = {}
        applied_rules: List[AppliedRule] = []

        default_min_score = profile.defaults.min_score

        # Track the strongest rule to generate the summary sentence
        strongest_rule_info = None

        for rule in profile.rules:
            # 1. Evaluate primary condition
            matching_findings: List[Finding] = []
            if rule.when is not None:
                for f in findings:
                    if _matches_condition(
                        f,
                        rule.when,
                        default_min_score,
                        source,
                        destination_trust,
                    ):
                        matching_findings.append(f)
            else:
                # No 'when' condition means match all findings
                matching_findings = list(findings)

            # Check min_count
            if len(matching_findings) < rule.min_count:
                continue

            # 2. Evaluate combination requirement (requires_any)
            required_findings: List[Finding] = []
            if rule.requires_any:
                matching_ids = {f.id for f in matching_findings}
                for other_f in findings:
                    if other_f.id in matching_ids:
                        continue
                    for selector in rule.requires_any:
                        if _matches_selector(other_f, selector, default_min_score):
                            required_findings.append(other_f)
                            break

                # If combination condition is not satisfied, rule does not fire
                if not required_findings:
                    continue

            # 2b. Evaluate exclusion requirement (requires_none)
            if rule.when and rule.when.requires_none:
                matching_ids = {f.id for f in matching_findings}
                has_forbidden = False
                for other_f in findings:
                    if other_f.id in matching_ids:
                        continue
                    for selector in rule.when.requires_none:
                        if _matches_selector(other_f, selector, default_min_score):
                            has_forbidden = True
                            break
                    if has_forbidden:
                        break
                if has_forbidden:
                    continue

            # 3. Rule fires! Record applied rule
            affected_ids = [f.id for f in matching_findings]
            if rule.then.also_apply_to_requires and required_findings:
                for rf in required_findings:
                    if rf.id not in affected_ids:
                        affected_ids.append(rf.id)

            applied_rules.append(
                AppliedRule(
                    rule_id=rule.id,
                    reason=rule.reason,
                    finding_ids=affected_ids,
                )
            )

            # 4. Update overall decision (strongest wins)
            rule_decision = rule.then.decision
            if DECISION_RANKS[rule_decision] > DECISION_RANKS[current_decision]:
                current_decision = rule_decision
                strongest_rule_info = (rule_decision, rule.id, rule.reason)
            elif strongest_rule_info is None and rule_decision == current_decision:
                strongest_rule_info = (rule_decision, rule.id, rule.reason)

            # 5. Update per-finding actions (strongest wins)
            for f in matching_findings:
                if f.id not in per_finding_actions:
                    per_finding_actions[f.id] = rule.then.action
                elif ACTION_RANKS[rule.then.action] > ACTION_RANKS[per_finding_actions[f.id]]:
                    per_finding_actions[f.id] = rule.then.action

            if rule.then.also_apply_to_requires and required_findings:
                for rf in required_findings:
                    if rf.id not in per_finding_actions:
                        per_finding_actions[rf.id] = rule.then.action
                    elif ACTION_RANKS[rule.then.action] > ACTION_RANKS[per_finding_actions[rf.id]]:
                        per_finding_actions[rf.id] = rule.then.action


        # Generate human-readable summary
        if current_decision == Decision.ALLOW:
            summary = "Submission allowed: no policy violations detected."
        else:
            prefix_map = {
                Decision.BLOCK: "Submission blocked",
                Decision.REDACT: "Redaction recommended",
                Decision.REQUIRE_APPROVAL: "Approval required",
            }
            prefix = prefix_map.get(current_decision, "Review required")
            rule_id = strongest_rule_info[1] if strongest_rule_info else "POLICY"
            reason = strongest_rule_info[2] if strongest_rule_info else "Policy match"
            summary = f"{prefix}: {reason} (rule {rule_id})."

        options = DECISION_OPTIONS_MAP.get(current_decision, ["edit", "cancel"])

        return PolicyResult(
            decision=current_decision,
            options=options,
            applied_rules=applied_rules,
            per_finding_actions=per_finding_actions,
            summary=summary,
        )
