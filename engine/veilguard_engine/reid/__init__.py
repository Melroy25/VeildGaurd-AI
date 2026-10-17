"""Re-identification package: Quasi-identifier correlation, scoring, and reduction."""

from veilguard_engine.reid.score import Contributor, ReidScore, ReidScorer
from veilguard_engine.reid.reduce import ReidReducer, ReidReductionResult, generalize_value

__all__ = [
    "Contributor",
    "ReidScore",
    "ReidScorer",
    "ReidReducer",
    "ReidReductionResult",
    "generalize_value",
]
