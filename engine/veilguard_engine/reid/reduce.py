"""Quasi-identifier generalization reducer module (Phase 5 Part C4).

Iteratively generalizes quasi-identifiers to reduce re-identification risk score
below target threshold (0.5), prioritizing:
1. Necessity rank: 'unnecessary' before 'optional' before 'required'
2. Heuristic weight descending

Generalizations:
- QUASI_AGE -> decade ('30s')
- QUASI_ORG -> '[COMPANY_n]'
- QUASI_LOCATION -> '[CITY_n]'
- QUASI_EVENT -> generic category ('personal leave', 'medical leave', 'career event', etc.) or '[EVENT_n]'
- QUASI_ROLE -> '[ROLE_n]'
- QUASI_GENDER is NEVER changed.

Invariant:
If the target cannot be reached without altering 'required' details,
keep them and raise the decision to at least 'require_approval' with a trade-off note.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Literal, Optional, Set
from pydantic import BaseModel, Field

from veilguard_engine.models import Finding
from veilguard_engine.reid.score import Contributor, ReidScore, ReidScorer

EVENT_GENERALIZATIONS: Dict[str, str] = {
    "maternity leave": "personal leave",
    "paternity leave": "personal leave",
    "parental leave": "personal leave",
    "bereavement leave": "personal leave",
    "sick leave": "medical leave",
    "surgery": "medical treatment",
    "promotion": "career event",
    "promoted": "career event",
    "resignation": "employment change",
    "resigned": "employment change",
    "termination": "employment change",
    "terminated": "employment change",
    "layoff": "workforce adjustment",
    "laid off": "workforce adjustment",
    "lawsuit": "legal matter",
    "divorce": "family event",
}


class ReidReductionResult(BaseModel):
    score_before: float = Field(description="Re-identification score before reduction")
    score_after: float = Field(description="Re-identification score after reduction")
    level_before: Literal["low", "medium", "high"] = Field(description="Level before reduction")
    level_after: Literal["low", "medium", "high"] = Field(description="Level after reduction")
    target: float = Field(description="Target threshold for reduction")
    contributors: List[Contributor] = Field(description="Initial risk contributors")
    applied: List[str] = Field(
        default_factory=list,
        description="List of finding IDs that were generalized",
    )
    generalizations: Dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of finding_id to generalized replacement text",
    )
    required_prevented_target: bool = Field(
        default=False,
        description="True if target could not be reached because required details were preserved",
    )


def generalize_value(
    entity_type: str,
    raw_text: str,
    label_counters: Dict[str, int],
) -> str:
    """Generate generalized replacement string for a quasi-identifier."""
    if entity_type == "QUASI_AGE":
        m = re.search(r"\d+", raw_text)
        if m:
            val = int(m.group(0))
            decade = (val // 10) * 10
            return f"{decade}s"
        return "[AGE]"

    if entity_type == "QUASI_ORG":
        idx = label_counters.get("COMPANY", 0) + 1
        label_counters["COMPANY"] = idx
        return f"[COMPANY_{idx}]"

    if entity_type == "QUASI_LOCATION":
        idx = label_counters.get("CITY", 0) + 1
        label_counters["CITY"] = idx
        return f"[CITY_{idx}]"

    if entity_type == "QUASI_EVENT":
        lower = raw_text.lower().strip()
        for k, v in EVENT_GENERALIZATIONS.items():
            if k in lower:
                return v
        idx = label_counters.get("EVENT", 0) + 1
        label_counters["EVENT"] = idx
        return f"[EVENT_{idx}]"

    if entity_type == "QUASI_ROLE":
        idx = label_counters.get("ROLE", 0) + 1
        label_counters["ROLE"] = idx
        return f"[ROLE_{idx}]"

    # Default fallback
    return raw_text


class ReidReducer:
    """Reduces re-identification risk by generalizing unnecessary/optional quasi-identifiers."""

    def __init__(self, scorer: Optional[ReidScorer] = None) -> None:
        self.scorer = scorer or ReidScorer.get_instance()

    def reduce(
        self,
        text: str,
        findings: List[Finding],
        per_finding_necessity: Optional[Dict[str, str]] = None,
        target: Optional[float] = None,
    ) -> ReidReductionResult:
        """Run re-identification reduction loop."""
        if per_finding_necessity is None:
            per_finding_necessity = {}

        target_thresh = target if target is not None else self.scorer.target

        # Filter quasi findings that can be generalized (QUASI_GENDER is never generalized)
        quasi_findings = [
            f for f in findings
            if f.entity_type.startswith("QUASI_") and f.entity_type != "QUASI_GENDER"
        ]

        initial_score_obj = self.scorer.score_findings(findings)
        score_before = initial_score_obj.score
        level_before = initial_score_obj.level
        contributors = initial_score_obj.contributors

        if score_before < target_thresh or not quasi_findings:
            return ReidReductionResult(
                score_before=score_before,
                score_after=score_before,
                level_before=level_before,
                level_after=level_before,
                target=target_thresh,
                contributors=contributors,
                applied=[],
                generalizations={},
                required_prevented_target=False,
            )

        current_score = score_before
        generalized: Dict[str, str] = {}
        applied_ids: List[str] = []
        label_counters: Dict[str, int] = {}

        remaining_types = {
            f.entity_type
            for f in findings
            if f.entity_type.startswith("QUASI_")
        }

        necessity_order = {"unnecessary": 1, "optional": 2, "required": 3}

        while current_score >= target_thresh:
            # Candidates not yet generalized
            candidates = [f for f in quasi_findings if f.id not in generalized]
            if not candidates:
                break

            # Sort by necessity ascending (1=unnecessary, 2=optional, 3=required),
            # then by weight descending, then by start offset
            candidates.sort(
                key=lambda f: (
                    necessity_order.get(per_finding_necessity.get(f.id, "optional"), 2),
                    -self.scorer.get_weight(f.entity_type),
                    f.start,
                )
            )

            best = candidates[0]
            best_nec = per_finding_necessity.get(best.id, "optional")

            # Invariant: Never alter required details
            if best_nec == "required":
                break

            # Generalize best
            raw_val = text[best.start : best.end]
            gen_val = generalize_value(best.entity_type, raw_val, label_counters)
            generalized[best.id] = gen_val
            applied_ids.append(best.id)

            # Check if any ungeneralized findings of this entity_type remain
            remaining_of_type = [
                f for f in quasi_findings
                if f.entity_type == best.entity_type and f.id not in generalized
            ]
            if not remaining_of_type:
                remaining_types.discard(best.entity_type)

            # Recompute score
            new_score_obj = self.scorer.score_types(remaining_types)
            current_score = new_score_obj.score

        final_score_obj = self.scorer.score_types(remaining_types)
        score_after = final_score_obj.score
        level_after = final_score_obj.level

        required_prevented = (
            score_after >= target_thresh
            and any(
                per_finding_necessity.get(f.id) == "required"
                for f in quasi_findings
                if f.id not in generalized
            )
        )

        return ReidReductionResult(
            score_before=score_before,
            score_after=score_after,
            level_before=level_before,
            level_after=level_after,
            target=target_thresh,
            contributors=contributors,
            applied=applied_ids,
            generalizations=generalized,
            required_prevented_target=required_prevented,
        )
