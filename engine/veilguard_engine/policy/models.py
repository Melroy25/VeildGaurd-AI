"""Data models and schemas for VeilGuard policy engine."""

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from veilguard_engine.models import Category


class Decision(str, Enum):
    ALLOW = "allow"
    REDACT = "redact"
    REQUIRE_APPROVAL = "require_approval"
    BLOCK = "block"


DECISION_RANKS: Dict[Decision, int] = {
    Decision.ALLOW: 1,
    Decision.REDACT: 2,
    Decision.REQUIRE_APPROVAL: 3,
    Decision.BLOCK: 4,
}

DECISION_OPTIONS_MAP: Dict[Decision, List[str]] = {
    Decision.ALLOW: ["send_original"],
    Decision.REDACT: ["send_sanitized", "edit", "cancel"],
    Decision.REQUIRE_APPROVAL: [
        "send_sanitized",
        "send_original_confirmed",
        "edit",
        "cancel",
    ],
    Decision.BLOCK: ["edit", "cancel"],
}


class Action(str, Enum):
    KEEP = "keep"
    GENERALIZE = "generalize"
    PSEUDONYMIZE = "pseudonymize"
    MASK = "mask"
    REMOVE = "remove"
    REDUCE_REID = "reduce_reid"


ACTION_RANKS: Dict[Action, int] = {
    Action.KEEP: 1,
    Action.GENERALIZE: 2,
    Action.REDUCE_REID: 2,
    Action.PSEUDONYMIZE: 3,
    Action.MASK: 4,
    Action.REMOVE: 5,
}


class DestinationTrust(str, Enum):
    TRUSTED = "trusted"
    STANDARD = "standard"
    UNTRUSTED = "untrusted"


class StrictBaseModel(BaseModel):
    """Base model that forbids unknown fields to enforce fail-closed behavior."""
    model_config = ConfigDict(extra="forbid")


class RuleSelector(StrictBaseModel):
    """Selector condition matching a finding."""
    categories: List[Category] = Field(default_factory=list)
    entity_types: List[str] = Field(default_factory=list)
    min_score: Optional[float] = None
    validated: Optional[bool] = None


class RuleCondition(StrictBaseModel):
    """Primary when condition matching findings and context."""
    categories: List[Category] = Field(default_factory=list)
    entity_types: List[str] = Field(default_factory=list)
    min_score: Optional[float] = None
    validated: Optional[bool] = None
    sources: List[str] = Field(default_factory=list)
    destination_trust: List[DestinationTrust] = Field(default_factory=list)
    requires_none: List[RuleSelector] = Field(default_factory=list)
    reid_levels: List[str] = Field(default_factory=list)



class RuleThen(StrictBaseModel):
    """Action and decision to enforce when rule conditions are satisfied."""
    decision: Decision
    action: Action
    also_apply_to_requires: bool = False


class PolicyRule(StrictBaseModel):
    """Declarative policy rule specification."""
    id: str
    description: str = ""
    when: Optional[RuleCondition] = None
    requires_any: List[RuleSelector] = Field(default_factory=list)
    min_count: int = 1
    then: RuleThen
    reason: str


class PolicyDefaults(StrictBaseModel):
    """Default parameters for a policy profile."""
    min_score: float = 0.4


class PolicyProfile(StrictBaseModel):
    """Top-level schema for a policy profile YAML file."""
    version: int = 1
    profile: str
    description: str
    defaults: PolicyDefaults = Field(default_factory=PolicyDefaults)
    rules: List[PolicyRule]


class DestinationsFile(StrictBaseModel):
    """Top-level schema for destinations.yaml."""
    version: int = 1
    default_trust: DestinationTrust = DestinationTrust.STANDARD
    destinations: Dict[str, DestinationTrust] = Field(default_factory=dict)


class AppliedRule(StrictBaseModel):
    """Record of a rule that matched during policy evaluation."""
    rule_id: str
    reason: str
    finding_ids: List[str]


class PolicyResult(StrictBaseModel):
    """Complete explainable result of policy evaluation."""
    decision: Decision
    options: List[str]
    applied_rules: List[AppliedRule]
    per_finding_actions: Dict[str, Action]
    summary: str
