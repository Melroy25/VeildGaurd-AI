"""bench/baselines/keyword.py — Competent keyword / regex baseline.

Rules are frozen before any VeilGuard benchmarking. This is NOT a strawman:
it uses patterns an experienced engineer would write in ~1 hour.

Rule inventory (documented here per Phase 5 prompt §5.1):
  R01  10-digit Indian mobile number (starts 6-9, not in order/product context)
  R02  Email address
  R03  12-digit number possibly matching Aadhaar or bank account
  R04  PAN-like pattern (5 uppercase alpha + 4 digits + 1 uppercase alpha)
  R05  Card-like number (13-16 digits, optionally space/dash grouped)
  R06  Secret keywords (password, api key, token, secret, private key, bearer)
  R07  Secret patterns (AKIA…, ghp_…, sk_live_…, xoxb-…, AIza…, connection strings)
  R08  Confidentiality keywords (confidential, internal only, proprietary)
  R09  Medical term list (150 terms — imported from data/medical_terms.txt when present,
       fallback to embedded list)
  R10  IFSC code (bank code 4 alpha + 0 + 6 alphanum)
  R11  UPI VPA (local@handle pattern with UPI bank handles)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, List, Tuple

# ─── Regex patterns ───────────────────────────────────────────────────────────

# R01 — Indian mobile: 10 digits starting 6-9, not embedded in longer numbers
_MOBILE_RE = re.compile(r"(?<!\d)(\+91[-\s]?)?[6-9]\d{9}(?!\d)")

# R02 — Email
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

# R03 — 12-digit numeric (Aadhaar / bank account)
_TWELVE_DIGIT_RE = re.compile(r"(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)")

# R04 — PAN-like: 5 alpha (AAAAA), 4 digits, 1 alpha — uppercase only
_PAN_RE = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")

# R05 — Card-like: 13-16 contiguous digits or spaced groups of 4
_CARD_RE = re.compile(
    r"(?<!\d)(?:\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{1,4}|\d{13,16})(?!\d)"
)

# R06 — Secret keywords (context is the 80 chars around the keyword)
_SECRET_KW_RE = re.compile(
    r"\b(password|passwd|api[\s_-]?key|auth[\s_-]?token|bearer[\s_-]?token|"
    r"private[\s_-]?key|secret[\s_-]?key|access[\s_-]?key|client[\s_-]?secret|"
    r"encryption[\s_-]?key)\b",
    re.IGNORECASE,
)

# R07 — Secret patterns
_SECRET_PATTERNS: List[Tuple[str, re.Pattern]] = [
    ("AWS_KEY", re.compile(r"\bAKIA[A-Z0-9]{16}\b")),
    ("GITHUB_TOKEN", re.compile(r"\bghp_[A-Za-z0-9]{36}\b")),
    ("STRIPE_KEY", re.compile(r"\bsk_live_[A-Za-z0-9]{24}\b")),
    ("SLACK_TOKEN", re.compile(r"\bxoxb-\d{10,13}-\d{10,13}-[A-Za-z0-9]{10,20}\b")),
    ("GOOGLE_KEY", re.compile(r"\bAIza[A-Za-z0-9\-_]{35}\b")),
    ("CONNECTION_STR", re.compile(
        r"(postgresql|mysql|mongodb|redis|mssql|amqp)://[^\s\"']{6,}",
        re.IGNORECASE
    )),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b")),
]

# R08 — Confidentiality terms
_CONFIDENTIAL_KW_RE = re.compile(
    r"\b(confidential|internal[\s_-]?only|proprietary|trade[\s_-]?secret|"
    r"not[\s_-]?for[\s_-]?distribution|restricted)\b",
    re.IGNORECASE,
)

# R09 — Medical terms (embedded fallback list; file loaded at class init if present)
_MEDICAL_FALLBACK = [
    "diabetes", "hypertension", "cancer", "depression", "anxiety", "adhd",
    "schizophrenia", "chemotherapy", "surgery", "asthma", "hypothyroidism",
    "metformin", "amlodipine", "atenolol", "insulin", "levothyroxine",
    "paracetamol", "ibuprofen", "aspirin", "omeprazole", "diagnosis",
    "HIV", "AIDS", "tuberculosis", "epilepsy", "stroke", "dementia",
    "bipolar", "autism", "hepatitis", "cirrhosis", "pneumonia", "ADHD",
]

# R10 — IFSC code
_IFSC_RE = re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b")

# R11 — UPI VPA
_UPI_HANDLES = r"(oksbi|okaxis|okhdfcbank|okicici|paytm|ybl|upi|apl|ibl|axl|" \
               r"timecosmos|jiomoney|airtel|freecharge|sbi|hdfc|icici|axis)"
_UPI_RE = re.compile(r"[a-zA-Z0-9_.+\-]{3,}@" + _UPI_HANDLES, re.IGNORECASE)


# ─── Result type ──────────────────────────────────────────────────────────────

@dataclass
class KeywordFinding:
    start: int
    end: int
    rule: str
    text: str  # Not logged; used only for sanitizer replacement in memory


# ─── Baseline class ───────────────────────────────────────────────────────────

class KeywordBaseline:
    """Competent keyword / regex privacy detector.

    Intended to represent an engineering-hour effort — tuned for recall on
    obvious patterns, NOT tuned against any benchmark data.
    """

    _MEDICAL_TERMS: List[str] | None = None

    def __init__(self) -> None:
        if self._MEDICAL_TERMS is None:
            self._load_medical_terms()

    @classmethod
    def _load_medical_terms(cls) -> None:
        data_dir = Path(__file__).parent.parent / "data"
        terms_file = data_dir / "medical_terms.txt"
        if terms_file.exists():
            cls._MEDICAL_TERMS = [
                line.strip().lower()
                for line in terms_file.read_text(encoding="utf-8").splitlines()
                if line.strip() and not line.startswith("#")
            ]
        else:
            cls._MEDICAL_TERMS = [t.lower() for t in _MEDICAL_FALLBACK]

    def _medical_re(self) -> re.Pattern:
        escaped = [re.escape(t) for t in (self._MEDICAL_TERMS or [])]
        pattern = r"\b(" + "|".join(escaped) + r")\b"
        return re.compile(pattern, re.IGNORECASE)

    def detect(self, text: str) -> List[KeywordFinding]:
        """Return all keyword findings in text (no deduplication; caller merges)."""
        findings: List[KeywordFinding] = []
        seen: set[Tuple[int, int]] = set()

        def _add(start: int, end: int, rule: str) -> None:
            if (start, end) not in seen:
                seen.add((start, end))
                findings.append(KeywordFinding(start=start, end=end, rule=rule, text=text[start:end]))

        # R01 — Mobile
        for m in _MOBILE_RE.finditer(text):
            _add(m.start(), m.end(), "R01_MOBILE")

        # R02 — Email (before UPI to let UPI override)
        for m in _EMAIL_RE.finditer(text):
            # Skip if already claimed as UPI
            raw = text[m.start():m.end()]
            if any(raw.lower().endswith("@" + h) for h in [
                "oksbi","okaxis","okhdfcbank","okicici","paytm","ybl","upi",
                "apl","ibl","axl","timecosmos","jiomoney","airtel","freecharge",
                "sbi","hdfc","icici","axis",
            ]):
                continue
            _add(m.start(), m.end(), "R02_EMAIL")

        # R11 — UPI
        for m in _UPI_RE.finditer(text):
            _add(m.start(), m.end(), "R11_UPI")

        # R03 — 12-digit
        for m in _TWELVE_DIGIT_RE.finditer(text):
            _add(m.start(), m.end(), "R03_12DIGIT")

        # R04 — PAN
        for m in _PAN_RE.finditer(text):
            _add(m.start(), m.end(), "R04_PAN")

        # R05 — Card
        for m in _CARD_RE.finditer(text):
            _add(m.start(), m.end(), "R05_CARD")

        # R06 — Secret keywords: flag the surrounding value token
        for m in _SECRET_KW_RE.finditer(text):
            # Capture the value token after '=' or ':' within 80 chars
            after = text[m.end():m.end() + 80]
            val_m = re.search(r"[=:\s][\"']?([^\s\"',;]{6,})", after)
            if val_m:
                val_start = m.end() + val_m.start(1)
                val_end = m.end() + val_m.end(1)
                _add(val_start, val_end, "R06_SECRET_KW")
            else:
                _add(m.start(), m.end(), "R06_SECRET_KW")

        # R07 — Secret patterns
        for name, pat in _SECRET_PATTERNS:
            for m in pat.finditer(text):
                _add(m.start(), m.end(), f"R07_{name}")

        # R08 — Confidential keywords
        for m in _CONFIDENTIAL_KW_RE.finditer(text):
            _add(m.start(), m.end(), "R08_CONFIDENTIAL")

        # R09 — Medical
        med_re = self._medical_re()
        for m in med_re.finditer(text):
            _add(m.start(), m.end(), "R09_MEDICAL")

        # R10 — IFSC
        for m in _IFSC_RE.finditer(text):
            # Skip if already part of GSTIN-like or PAN-like
            if (m.start(), m.end()) not in seen:
                _add(m.start(), m.end(), "R10_IFSC")

        return sorted(findings, key=lambda f: f.start)

    def sanitize(self, text: str) -> str:
        """Replace all detected spans with [REDACTED]."""
        findings = self.detect(text)
        # Apply in reverse order to preserve offsets
        result = list(text)
        for f in reversed(findings):
            result[f.start:f.end] = list("[REDACTED]")
        return "".join(result)

    def is_flagged(self, text: str) -> bool:
        """Return True if any finding is detected."""
        return len(self.detect(text)) > 0
