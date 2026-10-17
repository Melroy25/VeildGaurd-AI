"""Necessity package: Task intent profile classification and entity necessity matrices."""

from veilguard_engine.necessity.resolver import (
    NecessityMatrix,
    NecessityResult,
    UtilityAssessment,
    evaluate_necessity,
)

__all__ = [
    "NecessityMatrix",
    "NecessityResult",
    "UtilityAssessment",
    "evaluate_necessity",
]
