"""Quasi-identifier detector module for VeilGuard (Phase 5 Part C4).

Detects attributes that, when combined, may allow re-identification:
- QUASI_AGE: age patterns (e.g. '34-year-old', 'aged 34', '34 yo', 'in her 30s')
- QUASI_ROLE: job roles and titles from roles.txt
- QUASI_ORG: organizations via spaCy ORG, corporate suffixes, and watchlist
- QUASI_LOCATION: locations via spaCy GPE/LOC and major city list
- QUASI_EVENT: sensitive employment/personal events from sensitive_events.txt
- QUASI_GENDER: gendered pronouns/nouns (low weight, never sanitized)

Invariant:
Quasi-identifier findings DO NOT trigger policy actions by themselves.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import List, Optional, Set, Tuple
import spacy

from veilguard_engine import config
from veilguard_engine.models import Category, Finding

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ROLES_FILE = DATA_DIR / "roles.txt"
EVENTS_FILE = DATA_DIR / "sensitive_events.txt"

# Major Indian and global tech cities to supplement spaCy GPE
SUPPLEMENTAL_CITIES = {
    "pune", "mumbai", "delhi", "bengaluru", "bangalore", "hyderabad",
    "chennai", "kolkata", "ahmedabad", "jaipur", "surat", "noida",
    "gurgaon", "gurugram", "chandigarh", "indore", "kochi", "cochin",
    "london", "new york", "san francisco", "seattle", "austin", "boston",
    "singapore", "tokyo", "dubai", "toronto", "berlin",
}

# Corporate suffixes indicating organization
CORP_SUFFIX_PATTERN = re.compile(
    r"\b([A-Z][a-zA-Z0-9&]*(?:\s+[A-Z][a-zA-Z0-9&]*)*\s+(?:Inc\.?|Corp\.?|Ltd\.?|LLC|Pvt\.?\s*Ltd\.?|Technologies|Solutions|Industries|Labs|Enterprises|Systems|Global))\b"
)

# Age patterns
AGE_PATTERNS = [
    re.compile(r"\b(\d{1,3})[- ]year[- ]olds?\b", re.IGNORECASE),
    re.compile(r"\baged?\s+(\d{1,3})\b", re.IGNORECASE),
    re.compile(r"\b(\d{1,3})\s*(?:yo|y\.o\.|years?\s+old)\b", re.IGNORECASE),
    re.compile(r"\bin\s+(?:his|her|their)\s+(\d0)s\b", re.IGNORECASE),
]

# Gender pronouns / nouns
GENDER_PATTERN = re.compile(
    r"\b(he|she|his|her|hers|him|himself|herself|female|male|woman|man)\b",
    re.IGNORECASE,
)


def _load_term_list(path: Path) -> List[str]:
    if not path.exists():
        return []
    terms = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                terms.append(stripped.lower())
    # Sort descending by length so longer multi-word phrases match first
    terms.sort(key=len, reverse=True)
    return terms


class QuasiDetector:
    """Detector for quasi-identifiers used in re-identification risk scoring."""

    name: str = "quasi"
    _nlp: Optional[spacy.language.Language] = None

    def __init__(self, spacy_model: Optional[str] = None) -> None:
        self.spacy_model = spacy_model or config.SPACY_MODEL
        self._roles = _load_term_list(ROLES_FILE)
        self._events = _load_term_list(EVENTS_FILE)

    @classmethod
    def _get_nlp(cls, model_name: str) -> spacy.language.Language:
        if cls._nlp is None:
            cls._nlp = spacy.load(model_name)
        return cls._nlp

    def detect(self, text: str) -> List[Finding]:
        """Detect all quasi-identifiers in the text."""
        raw_spans: List[Tuple[int, int, str, str]] = []  # (start, end, entity_type, reason)

        # 1. QUASI_AGE
        for pat in AGE_PATTERNS:
            for m in pat.finditer(text):
                raw_spans.append((
                    m.start(),
                    m.end(),
                    "QUASI_AGE",
                    "Age pattern detected as quasi-identifier",
                ))

        # 2. QUASI_ROLE
        text_lower = text.lower()
        for role in self._roles:
            # Word boundary regex for role
            escaped = re.escape(role)
            for m in re.finditer(rf"\b{escaped}\b", text_lower):
                raw_spans.append((
                    m.start(),
                    m.end(),
                    "QUASI_ROLE",
                    f"Professional role '{role}' detected as quasi-identifier",
                ))

        # 3. QUASI_EVENT
        for ev in self._events:
            escaped = re.escape(ev)
            for m in re.finditer(rf"\b{escaped}\b", text_lower):
                raw_spans.append((
                    m.start(),
                    m.end(),
                    "QUASI_EVENT",
                    f"Sensitive event '{ev}' detected as quasi-identifier",
                ))

        # 4. QUASI_GENDER
        for m in GENDER_PATTERN.finditer(text):
            raw_spans.append((
                m.start(),
                m.end(),
                "QUASI_GENDER",
                "Gendered attribute detected as quasi-identifier",
            ))

        # 5. QUASI_ORG via corporate suffix regex
        for m in CORP_SUFFIX_PATTERN.finditer(text):
            raw_spans.append((
                m.start(),
                m.end(),
                "QUASI_ORG",
                "Organization name with corporate suffix detected as quasi-identifier",
            ))

        # 6. QUASI_LOCATION via supplemental cities
        for city in SUPPLEMENTAL_CITIES:
            for m in re.finditer(rf"\b{re.escape(city)}\b", text_lower):
                raw_spans.append((
                    m.start(),
                    m.end(),
                    "QUASI_LOCATION",
                    f"Geographic location '{city}' detected as quasi-identifier",
                ))

        # 7. spaCy NER for ORG and GPE/LOC
        nlp = self._get_nlp(self.spacy_model)
        doc = nlp(text)
        for ent in doc.ents:
            if ent.label_ == "ORG":
                raw_spans.append((
                    ent.start_char,
                    ent.end_char,
                    "QUASI_ORG",
                    "Organization name detected by NER as quasi-identifier",
                ))
            elif ent.label_ in ("GPE", "LOC"):
                raw_spans.append((
                    ent.start_char,
                    ent.end_char,
                    "QUASI_LOCATION",
                    "Geographic location detected by NER as quasi-identifier",
                ))

        # Resolve overlaps within quasi findings: longer span wins
        raw_spans.sort(key=lambda s: (s[0], -(s[1] - s[0])))
        deduped: List[Tuple[int, int, str, str]] = []
        occupied: List[Tuple[int, int]] = []

        for start, end, etype, reason in raw_spans:
            # Check overlap with already accepted spans
            has_overlap = False
            for o_start, o_end in occupied:
                if max(start, o_start) < min(end, o_end):
                    has_overlap = True
                    break
            if not has_overlap:
                occupied.append((start, end))
                deduped.append((start, end, etype, reason))

        # Sort by start offset
        deduped.sort(key=lambda s: s[0])

        findings: List[Finding] = []
        for i, (start, end, etype, reason) in enumerate(deduped, 1):
            findings.append(
                Finding(
                    id=f"quasi_{i}",
                    category=Category.QUASI_IDENTIFIER,
                    entity_type=etype,
                    start=start,
                    end=end,
                    score=0.85 if etype != "QUASI_GENDER" else 0.50,
                    detector="quasi",
                    rule_id=f"{etype}.detected.v1",
                    reason=reason,
                    validated=None,
                )
            )

        return findings
