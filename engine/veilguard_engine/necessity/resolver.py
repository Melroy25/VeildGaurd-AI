"""Necessity matrix resolver and policy adjustment module (Phase 5 Part C2).

Enforces core invariants:
1. Necessity NEVER weakens a block, and NEVER keeps a SECRET.
   Government IDs that a profile blocks stay blocked.
2. A 'required' finding whose policy action would be pseudonymize, mask, or remove
   (non-SECRET, decision not block):
   - action becomes Action.KEEP
   - decision rises to at least Decision.REQUIRE_APPROVAL
   - trade-off entry added: "the task needs this detail; sending it exposes <category>"
3. 'unnecessary' and 'optional' findings keep the policy's action.
4. Utility signal:
   - basis: "task_aware" (or "type_only" if task unknown)
   - may_change_result:
     - "high" if any altered finding is required
     - "possible" if any altered finding is optional
     - "low" if every altered finding is unnecessary (or none altered)
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
import yaml
from pydantic import BaseModel, Field

from veilguard_engine.context.task import TaskProfile
from veilguard_engine.models import Category
from veilguard_engine.policy.models import Action, Decision, PolicyResult
from veilguard_engine.scanner import Finding

MATRIX_FILE = Path(__file__).resolve().parent / "matrix.yaml"

SECRET_TYPES = {
    "API_KEY",
    "AWS_ACCESS_KEY",
    "GITHUB_TOKEN",
    "SLACK_TOKEN",
    "GOOGLE_API_KEY",
    "STRIPE_KEY",
    "JWT_TOKEN",
    "PRIVATE_KEY",
    "CONNECTION_STRING",
    "GENERIC_SECRET",
}


class UtilityAssessment(BaseModel):
    basis: Literal["task_aware", "type_only"] = Field(
        description="Whether utility is evaluated based on task context or type alone"
    )
    may_change_result: Literal["low", "possible", "high"] = Field(
        description="Likelihood that sanitization alters model task completion"
    )
    notes: str = Field(description="Explanatory notes regarding utility impact")


class NecessityResult(BaseModel):
    per_finding_necessity: Dict[str, str] = Field(
        description="Mapping of finding_id to necessity level ('required', 'optional', 'unnecessary')"
    )
    adjusted_decision: Decision = Field(
        description="Policy decision after necessity invariant adjustments"
    )
    adjusted_actions: Dict[str, Action] = Field(
        description="Per-finding actions after necessity invariant adjustments"
    )
    tradeoffs: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Trade-offs incurred when required findings are kept"
    )
    utility: UtilityAssessment = Field(
        description="Assessed utility preservation impact"
    )


class NecessityMatrix:
    """Loads and resolves necessity levels per task and entity type/category."""

    _instance: Optional["NecessityMatrix"] = None

    def __init__(self, matrix_path: Path = MATRIX_FILE) -> None:
        self.matrix_path = matrix_path
        self._load()

    def _load(self) -> None:
        if not self.matrix_path.exists():
            self._tasks = {}
            return
        with open(self.matrix_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
            self._tasks = data.get("tasks", {})

    @classmethod
    def get_instance(cls) -> "NecessityMatrix":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def resolve(self, task_type: str, finding: Finding) -> str:
        """Resolve necessity for a finding given the task type.

        Returns one of: 'required', 'optional', 'unnecessary'.
        """
        if not task_type or task_type == "unknown" or task_type not in self._tasks:
            return "optional"

        task_conf = self._tasks[task_type]
        overrides = task_conf.get("overrides", {})
        default_val = task_conf.get("defaults", "optional")

        # 1. Exact entity type match
        if finding.entity_type in overrides:
            return overrides[finding.entity_type]

        # 2. Category match
        cat_str = finding.category.value if hasattr(finding.category, "value") else str(finding.category)
        if cat_str in overrides:
            return overrides[cat_str]

        return default_val


def evaluate_necessity(
    findings: List[Finding],
    policy_result: PolicyResult,
    task_profile: TaskProfile,
    matrix: Optional[NecessityMatrix] = None,
) -> NecessityResult:
    """Evaluate necessity and apply invariants to policy result.

    Invariant Rules:
    1. Never weakens a block.
    2. Never keeps a SECRET (secrets stay removed or blocked).
    3. Blocked government IDs stay blocked.
    4. Required finding with non-keep action (and non-secret, non-block) -> action becomes KEEP,
       decision rises to at least REQUIRE_APPROVAL, trade-off recorded.
    5. Utility assessment based on altered findings.
    """
    if matrix is None:
        matrix = NecessityMatrix.get_instance()

    per_finding_necessity: Dict[str, str] = {}
    adjusted_actions: Dict[str, Action] = dict(policy_result.per_finding_actions)
    adjusted_decision: Decision = policy_result.decision
    tradeoffs: List[Dict[str, str]] = []

    # Map each finding's necessity
    for f in findings:
        per_finding_necessity[f.id] = matrix.resolve(task_profile.type, f)

    is_unknown_task = (task_profile.type == "unknown")

    # If task is unknown, all are treated as optional for adjustment purposes
    if is_unknown_task:
        for f in findings:
            per_finding_necessity[f.id] = "optional"

        # Utility calculation for type_only
        altered = [f for f in findings if adjusted_actions.get(f.id, Action.KEEP) != Action.KEEP]
        may_change = "possible" if altered else "low"
        utility = UtilityAssessment(
            basis="type_only",
            may_change_result=may_change,
            notes="Type-based evaluation without task context.",
        )
        return NecessityResult(
            per_finding_necessity=per_finding_necessity,
            adjusted_decision=adjusted_decision,
            adjusted_actions=adjusted_actions,
            tradeoffs=tradeoffs,
            utility=utility,
        )

    # Invariant checks and adjustments
    for f in findings:
        nec = per_finding_necessity[f.id]
        current_action = adjusted_actions.get(f.id, Action.KEEP)

        is_secret = (
            f.category == Category.SECRET
            or f.entity_type in SECRET_TYPES
        )

        if nec == "required":
            # Invariant 1: Never keep a secret
            if is_secret:
                # Keep original action; do not weaken
                continue

            # Invariant 1: If policy decision is BLOCK, do not weaken
            if policy_result.decision == Decision.BLOCK:
                continue

            # Invariant 2: Non-secret required finding with redaction/mask/remove action
            if current_action in (Action.PSEUDONYMIZE, Action.MASK, Action.REMOVE):
                adjusted_actions[f.id] = Action.KEEP

                # Decision rises to at least REQUIRE_APPROVAL
                if adjusted_decision in (Decision.ALLOW, Decision.REDACT):
                    adjusted_decision = Decision.REQUIRE_APPROVAL

                cat_str = f.category.value if hasattr(f.category, "value") else str(f.category)
                tradeoffs.append({
                    "finding_id": f.id,
                    "category": cat_str,
                    "tradeoff": f"the task needs this detail; sending it exposes {cat_str}",
                })

    # Invariant 1 check: If original decision was BLOCK, adjusted decision MUST be BLOCK
    if policy_result.decision == Decision.BLOCK:
        adjusted_decision = Decision.BLOCK

    # Utility Signal Calculation
    # may_change_result:
    # "low" if every altered finding is unnecessary (or none altered)
    # "possible" if any altered finding is optional
    # "high" if any required finding is altered
    altered_findings = [
        f for f in findings
        if adjusted_actions.get(f.id, Action.KEEP) in (Action.PSEUDONYMIZE, Action.MASK, Action.REMOVE)
    ]

    has_altered_required = any(per_finding_necessity.get(f.id) == "required" for f in altered_findings)
    has_altered_optional = any(per_finding_necessity.get(f.id) == "optional" for f in altered_findings)

    if has_altered_required:
        may_change_result = "high"
    elif has_altered_optional:
        may_change_result = "possible"
    else:
        may_change_result = "low"

    utility = UtilityAssessment(
        basis="task_aware",
        may_change_result=may_change_result,
        notes=f"Task '{task_profile.type}' evaluated; {len(tradeoffs)} trade-off(s) identified.",
    )

    return NecessityResult(
        per_finding_necessity=per_finding_necessity,
        adjusted_decision=adjusted_decision,
        adjusted_actions=adjusted_actions,
        tradeoffs=tradeoffs,
        utility=utility,
    )
