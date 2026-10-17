"""Re-identification risk scoring module (Phase 5 Part C4).

Computes noisy-OR risk score over distinct quasi-identifier types present:
Score = 1.0 - product(1.0 - weight(t) for t in distinct_types)

IMPORTANT DISCLAIMER:
Weights are heuristic expert estimates, NOT statistical probabilities.
The score is a heuristic risk indicator, not a mathematical certainty of re-identification.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Set
import yaml
from pydantic import BaseModel, Field

from veilguard_engine.models import Finding

WEIGHTS_FILE = Path(__file__).resolve().parent / "weights.yaml"


class Contributor(BaseModel):
    type: str = Field(description="Quasi-identifier entity type")
    weight: float = Field(description="Assigned heuristic weight")


class ReidScore(BaseModel):
    score: float = Field(description="Heuristic re-identification risk score (0.0 - 1.0)")
    level: Literal["low", "medium", "high"] = Field(
        description="Risk level tier ('low' < 0.5, 'medium' >= 0.5, 'high' >= 0.7)"
    )
    contributors: List[Contributor] = Field(
        default_factory=list,
        description="List of distinct quasi-identifier types contributing to the score",
    )
    target: float = Field(default=0.5, description="Target threshold for reduction")


class ReidScorer:
    """Computes noisy-OR re-identification risk scores from findings."""

    _instance: Optional["ReidScorer"] = None

    def __init__(self, weights_path: Path = WEIGHTS_FILE) -> None:
        self.weights_path = weights_path
        self._load()

    def _load(self) -> None:
        if not self.weights_path.exists():
            self._weights = {
                "QUASI_AGE": 0.25,
                "QUASI_ROLE": 0.20,
                "QUASI_ORG": 0.35,
                "QUASI_LOCATION": 0.25,
                "QUASI_EVENT": 0.30,
                "QUASI_GENDER": 0.05,
            }
            self._thresholds = {"medium": 0.5, "high": 0.7}
            self._target = 0.5
            return

        with open(self.weights_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
            self._weights = data.get("weights", {})
            self._thresholds = data.get("thresholds", {"medium": 0.5, "high": 0.7})
            self._target = data.get("target", 0.5)

    @classmethod
    def get_instance(cls) -> "ReidScorer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def target(self) -> float:
        return self._target

    def get_weight(self, entity_type: str) -> float:
        return self._weights.get(entity_type, 0.0)

    def score_types(self, quasi_types: Set[str]) -> ReidScore:
        """Compute noisy-OR score given a set of distinct quasi entity types."""
        contributors: List[Contributor] = []
        prod = 1.0

        # Sort for deterministic processing
        for qtype in sorted(quasi_types):
            w = self.get_weight(qtype)
            if w > 0.0:
                contributors.append(Contributor(type=qtype, weight=w))
                prod *= (1.0 - w)

        score = round(1.0 - prod, 4)

        high_thresh = self._thresholds.get("high", 0.7)
        med_thresh = self._thresholds.get("medium", 0.5)

        if score >= high_thresh:
            level = "high"
        elif score >= med_thresh:
            level = "medium"
        else:
            level = "low"

        return ReidScore(
            score=score,
            level=level,
            contributors=contributors,
            target=self._target,
        )

    def score_findings(self, findings: List[Finding]) -> ReidScore:
        """Extract distinct quasi types from findings and compute score."""
        quasi_types = {
            f.entity_type
            for f in findings
            if f.entity_type.startswith("QUASI_")
        }
        return self.score_types(quasi_types)
