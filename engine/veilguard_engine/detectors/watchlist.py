"""Watchlist detector for organization-specific confidential terms.

Loads proprietary project names, client names, and confidential keywords
from a configurable YAML file.
"""

import os
import re
from pathlib import Path
from typing import List, Optional, Set
import yaml

from veilguard_engine import config
from veilguard_engine.models import Category, Finding


class WatchlistDetector:
    """Detects confidential terms configured in an organization watchlist YAML file."""

    name: str = "watchlist_detector"

    def __init__(self, filepath: Optional[str] = None):
        self.filepath = Path(filepath or config.WATCHLIST_PATH)
        self.terms: List[str] = self._load_terms()
        self._compiled_regexes: List[Tuple[str, re.Pattern]] = [
            (term, re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE))
            for term in self.terms
        ]

    def _load_terms(self) -> List[str]:
        """Load terms from YAML file. Missing or invalid file results in an empty watchlist."""
        if not self.filepath.exists():
            return []

        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                if isinstance(data, dict) and "terms" in data and isinstance(data["terms"], list):
                    return [str(t).strip() for t in data["terms"] if str(t).strip()]
                elif isinstance(data, list):
                    return [str(t).strip() for t in data if str(t).strip()]
        except Exception:
            # Tolerant failure mode: missing or malformed file gives empty watchlist, not fatal error
            return []
        return []

    def detect(self, text: str) -> List[Finding]:
        findings: List[Finding] = []
        if not text or not self._compiled_regexes:
            return findings

        for term, pattern in self._compiled_regexes:
            for match in pattern.finditer(text):
                findings.append(
                    Finding(
                        id=f"watchlist_{match.start()}",
                        category=Category.CONFIDENTIAL,
                        entity_type="WATCHLIST_TERM",
                        start=match.start(),
                        end=match.end(),
                        score=0.95,
                        detector=self.name,
                        rule_id="WATCHLIST.term.v1",
                        validated=True,
                        reason="Identified confidential term registered in organization watchlist.",
                        also_detected_as=[],
                    )
                )

        return findings
