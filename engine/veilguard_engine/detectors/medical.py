"""Medical detector module for VeilGuard (Phase 5 Part C5).

Inspects text for clinical entities using a non-exhaustive curated clinical lexicon:
- MEDICAL_CONDITION: chronic/acute diagnoses, mental health conditions
- MEDICATION: common pharmaceuticals and active pharmaceutical ingredients by generic name
- MEDICAL_PROCEDURE: surgeries, therapies, diagnostic procedures

All findings belong to Category.MEDICAL.
Matches are whole-word, case-insensitive, with longest-span priority on overlaps.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import List, Optional, Tuple

from veilguard_engine.models import Category, Finding

LEXICON_FILE = Path(__file__).resolve().parent.parent / "data" / "medical_terms.txt"


def _load_medical_lexicon(path: Path) -> List[Tuple[str, str, re.Pattern[str]]]:
    """Load medical terms mapping to entity types, sorted longest first."""
    if not path.exists():
        return []

    entries: List[Tuple[str, str]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if ":" in stripped:
                term, etype = stripped.split(":", 1)
                term = term.strip().lower()
                etype = etype.strip().upper()
                if term and etype:
                    entries.append((term, etype))

    # Sort descending by term length for longest-match precedence
    entries.sort(key=lambda item: len(item[0]), reverse=True)

    compiled: List[Tuple[str, str, re.Pattern[str]]] = []
    for term, etype in entries:
        escaped = re.escape(term)
        pattern = re.compile(rf"\b{escaped}\b", re.IGNORECASE)
        compiled.append((term, etype, pattern))

    return compiled


class MedicalDetector:
    """Detector for medical conditions, medications, and clinical procedures."""

    name: str = "medical"

    def __init__(self, lexicon_path: Path = LEXICON_FILE) -> None:
        self.lexicon_path = lexicon_path
        self._terms = _load_medical_lexicon(lexicon_path)

    def detect(self, text: str) -> List[Finding]:
        """Detect medical terms in input text."""
        raw_spans: List[Tuple[int, int, str, str]] = []

        for term, etype, pat in self._terms:
            for m in pat.finditer(text):
                raw_spans.append((
                    m.start(),
                    m.end(),
                    etype,
                    f"Medical term '{term}' identified from clinical lexicon",
                ))

        if not raw_spans:
            return []

        # Deduplicate overlapping spans: longest span wins, earlier start on tie
        raw_spans.sort(key=lambda s: (s[0], -(s[1] - s[0])))
        deduped: List[Tuple[int, int, str, str]] = []
        occupied: List[Tuple[int, int]] = []

        for start, end, etype, reason in raw_spans:
            has_overlap = False
            for o_start, o_end in occupied:
                if max(start, o_start) < min(end, o_end):
                    has_overlap = True
                    break
            if not has_overlap:
                occupied.append((start, end))
                deduped.append((start, end, etype, reason))

        # Sort by start offset ascending
        deduped.sort(key=lambda s: s[0])

        findings: List[Finding] = []
        for i, (start, end, etype, reason) in enumerate(deduped, 1):
            findings.append(
                Finding(
                    id=f"med_{i}",
                    category=Category.MEDICAL,
                    entity_type=etype,
                    start=start,
                    end=end,
                    score=0.90,
                    detector="medical",
                    rule_id=f"{etype}.lexicon.v1",
                    reason=reason,
                    validated=None,
                )
            )

        return findings
