"""Data models for VeilGuard Sanitizer module."""

from typing import List, Literal, Optional
from pydantic import Field

from veilguard_engine.policy.models import Action, StrictBaseModel


class KnownPlaceholder(StrictBaseModel):
    """Seed mapping for consistent cross-turn pseudonymization."""
    entity_type: str = Field(description="Entity type, e.g. PERSON, PHONE_NUMBER")
    value: str = Field(description="Original entity text value for consistent matching")
    placeholder: str = Field(description="Assigned placeholder token, e.g. [PERSON_1]")


class ReplacementItem(StrictBaseModel):
    """Metadata describing a single replacement in the sanitized text.

    Strict Invariant (Rule 7):
    NEVER contains the original sensitive text substring.
    """
    finding_id: str
    original_start: int = Field(description="Start offset in original text (UTF-16 code units)")
    original_end: int = Field(description="End offset in original text (UTF-16 code units)")
    new_start: int = Field(description="Start offset in sanitized text (UTF-16 code units)")
    new_end: int = Field(description="End offset in sanitized text (UTF-16 code units)")
    action: Action
    placeholder: Optional[str] = None
    reversible: bool


class SanitizeExplanation(StrictBaseModel):
    """Human-readable explanation of an action applied to an entity."""
    entity_type: str
    action: Action
    rule_id: str
    reason: str


class UtilityNotice(StrictBaseModel):
    """Conservative type-based utility impact estimation."""
    basis: Literal["type_only"] = "type_only"
    may_change_result: Literal["possible", "low"]
    notes: List[str]


class SanitizeVerification(StrictBaseModel):
    """Verification metadata from re-scanning sanitized text."""
    rescanned: bool = True
    residual_findings: int
    residual_finding_types: List[str]


class SanitizeResult(StrictBaseModel):
    """Complete output produced by the Sanitizer."""
    sanitized_text: str
    replacements: List[ReplacementItem]
    explanations: List[SanitizeExplanation]
    utility: UtilityNotice
    verification: SanitizeVerification
