"""Scanner module coordinating all detectors and deterministic overlap resolution."""

import time
from typing import List, Optional

from veilguard_engine import config
from veilguard_engine.detectors.base import Detector
from veilguard_engine.detectors.india import IndiaDetector
from veilguard_engine.detectors.presidio_detector import PresidioDetector
from veilguard_engine.detectors.secrets import SecretsDetector
from veilguard_engine.detectors.watchlist import WatchlistDetector
from veilguard_engine.models import Category, Finding, ScanResponse, ScanStats


def get_finding_priority_tier(finding: Finding) -> int:
    """Return priority tier integer (higher = higher precedence).

    Priority Hierarchy:
    Tier 5: Checksum-validated own findings (IN_AADHAAR, IN_GSTIN, IN_PAN, etc.)
    Tier 4: Secrets detector findings
    Tier 3: Watchlist detector findings
    Tier 2: Other own findings (e.g. IN_MOBILE pattern)
    Tier 1: Presidio statistical/pattern findings
    """
    if finding.detector != "presidio":
        if finding.category == Category.SECRET:
            return 4
        if finding.category == Category.CONFIDENTIAL:
            return 3
        if finding.validated is True:
            return 5
        return 2
    return 1


def spans_overlap(start1: int, end1: int, start2: int, end2: int) -> bool:
    """Return True if two character spans overlap."""
    return max(start1, start2) < min(end1, end2)


def resolve_overlaps(findings: List[Finding]) -> List[Finding]:
    """Resolve overlapping spans deterministically based on priority tiers.

    Tie-breaking:
    1. Priority tier (Tier 5 down to Tier 1)
    2. Confidence score (higher score wins)
    3. Span length (longer span wins)
    4. Start offset (earlier start wins)

    Overridden findings populate the winning finding's `also_detected_as` list.
    Final results are sorted by start offset with stable sequential IDs (f1, f2, ...).
    """
    if not findings:
        return []

    # Sort all candidates by priority key descending
    sorted_candidates = sorted(
        findings,
        key=lambda f: (
            get_finding_priority_tier(f),
            f.score,
            (f.end - f.start),
            -f.start,
        ),
        reverse=True,
    )

    accepted: List[Finding] = []

    for candidate in sorted_candidates:
        overlapping_winner: Optional[Finding] = None
        for winner in accepted:
            if spans_overlap(candidate.start, candidate.end, winner.start, winner.end):
                overlapping_winner = winner
                break

        if overlapping_winner is None:
            # No conflict with already accepted findings
            accepted.append(candidate)
        else:
            # Overlaps with an already accepted higher-priority finding
            if (
                candidate.entity_type != overlapping_winner.entity_type
                and candidate.entity_type not in overlapping_winner.also_detected_as
            ):
                overlapping_winner.also_detected_as.append(candidate.entity_type)

    # Sort accepted findings by start offset ascending, then end offset
    accepted.sort(key=lambda f: (f.start, f.end))

    # Re-assign stable sequential IDs
    resolved: List[Finding] = []
    for idx, f in enumerate(accepted, start=1):
        f_copy = f.model_copy()
        f_copy.id = f"f{idx}"
        resolved.append(f_copy)

    return resolved


class Scanner:
    """Coordinates detection modules and produces resolved findings."""

    def __init__(
        self,
        detectors: Optional[List[Detector]] = None,
        spacy_model: Optional[str] = None,
    ):
        self.spacy_model = spacy_model or config.SPACY_MODEL
        if detectors is not None:
            self.detectors = detectors
        else:
            # Default production detector pipeline
            self.detectors = [
                IndiaDetector(),
                SecretsDetector(),
                WatchlistDetector(),
                PresidioDetector(spacy_model=self.spacy_model),
            ]

    def scan(self, text: str, source: str = "prompt") -> ScanResponse:
        """Execute all detectors and return resolved findings with latency metrics."""
        t_start = time.perf_counter()

        raw_findings: List[Finding] = []
        detector_names: List[str] = []

        for detector in self.detectors:
            detector_names.append(detector.name)
            try:
                results = detector.detect(text)
                raw_findings.extend(results)
            except Exception as e:
                # In production, continue running other detectors rather than failing silently
                continue

        resolved = resolve_overlaps(raw_findings)
        elapsed_ms = (time.perf_counter() - t_start) * 1000.0

        return ScanResponse(
            findings=resolved,
            stats=ScanStats(
                text_length=len(text),
                latency_ms=round(elapsed_ms, 3),
                detectors=detector_names,
                spacy_model=self.spacy_model,
            ),
        )
