"""India-specific privacy identifier detector.

Covers:
- IN_AADHAAR (12 digits, first digit 2-9, Verhoeff checksum validated)
- IN_PAN (10 characters, entity code validated)
- IN_GSTIN (15 characters, state code + PAN + Mod-36 checksum validated)
- IN_IFSC (11 characters, 4th character '0')
- IN_MOBILE (+91/91/0 prefix, 10 digits starting with 6-9)
- UPI_ID (name@handle from verified PSP handle list, non-email)
- IN_BANK_ACCOUNT (9-18 digits with preceding local context words)

Rule 7 Invariant: Finding reasons use generic templates and never contain raw text.
"""

import os
import re
from pathlib import Path
from typing import List, Set

from veilguard_engine.detectors.validators import (
    validate_verhoeff,
    validate_pan,
    validate_gstin,
)
from veilguard_engine.models import Category, Finding


def _load_upi_handles() -> Set[str]:
    """Load common UPI VPA handles from data/upi_handles.txt."""
    handles: Set[str] = set()
    current_dir = Path(__file__).resolve().parent
    data_file = current_dir.parent / "data" / "upi_handles.txt"
    if data_file.exists():
        with open(data_file, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    handles.add(stripped.lower())
    return handles


UPI_HANDLES: Set[str] = _load_upi_handles()

# Regex patterns with word boundaries
AADHAAR_CANDIDATE_REGEX = re.compile(r"\b([2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4})\b")
PAN_CANDIDATE_REGEX = re.compile(r"\b([A-Z]{5}\d{4}[A-Z])\b", re.IGNORECASE)
GSTIN_CANDIDATE_REGEX = re.compile(
    r"\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9])\b", re.IGNORECASE
)
IFSC_CANDIDATE_REGEX = re.compile(r"\b([A-Z]{4}0[A-Z0-9]{6})\b", re.IGNORECASE)
MOBILE_CANDIDATE_REGEX = re.compile(
    r"(?<!\d)(?:(?:\+91|91|0)[\s-]?)?([6-9]\d{9})(?!\d)"
)
UPI_CANDIDATE_REGEX = re.compile(r"\b([a-zA-Z0-9.\-_]{2,64})@([a-zA-Z0-9]+)\b")
BANK_ACCOUNT_DIGITS_REGEX = re.compile(r"(?<!\d)(\d{9,18})(?!\d)")

# Local context keywords for bank account detection (checked up to ~60 chars / ~6 tokens before the number)
BANK_ACCOUNT_CONTEXT_REGEX = re.compile(
    r"\b(?:account\s*(?:no|num|number)?|a/c\s*(?:no|num|number)?|acct\s*(?:no|num|number)?|acc\s*(?:no|num|number)?|savings\s*a/c|current\s*a/c)\b",
    re.IGNORECASE,
)


class IndiaDetector:
    """Detects Indian regional identifiers with structural and checksum validation."""

    name: str = "india_detector"

    def detect(self, text: str) -> List[Finding]:
        findings: List[Finding] = []
        if not text:
            return findings

        # Track spans already matched by high-confidence Indian IDs to avoid bank account collisions
        claimed_spans: set[tuple[int, int]] = set()

        # 1. IN_GSTIN (15 chars, Mod-36 checksum)
        for match in GSTIN_CANDIDATE_REGEX.finditer(text):
            val = match.group(1).upper()
            if validate_gstin(val):
                findings.append(
                    Finding(
                        id=f"in_gstin_{match.start()}",
                        category=Category.GOVERNMENT_ID,
                        entity_type="IN_GSTIN",
                        start=match.start(),
                        end=match.end(),
                        score=0.98,
                        detector=self.name,
                        rule_id="IN_GSTIN.mod36.v1",
                        validated=True,
                        reason="Validated Indian Goods and Services Tax Identification Number (GSTIN) with Mod-36 checksum.",
                        also_detected_as=[],
                    )
                )
                claimed_spans.add((match.start(), match.end()))

        # 2. IN_PAN (10 chars, structure and entity status code)
        for match in PAN_CANDIDATE_REGEX.finditer(text):
            val = match.group(1).upper()
            span = (match.start(), match.end())
            # Skip if inside an already validated GSTIN
            if any(s <= span[0] and span[1] <= e for s, e in claimed_spans):
                continue
            if validate_pan(val):
                findings.append(
                    Finding(
                        id=f"in_pan_{match.start()}",
                        category=Category.GOVERNMENT_ID,
                        entity_type="IN_PAN",
                        start=match.start(),
                        end=match.end(),
                        score=0.95,
                        detector=self.name,
                        rule_id="IN_PAN.structure.v1",
                        validated=True,
                        reason="Validated Indian Permanent Account Number (PAN) structure and entity code.",
                        also_detected_as=[],
                    )
                )
                claimed_spans.add(span)

        # 3. IN_AADHAAR (12 digits, first digit 2-9, Verhoeff checksum)
        for match in AADHAAR_CANDIDATE_REGEX.finditer(text):
            val = match.group(1)
            digits_only = re.sub(r"[\s-]", "", val)
            if len(digits_only) == 12 and validate_verhoeff(digits_only):
                span = (match.start(), match.end())
                findings.append(
                    Finding(
                        id=f"in_aadhaar_{match.start()}",
                        category=Category.GOVERNMENT_ID,
                        entity_type="IN_AADHAAR",
                        start=match.start(),
                        end=match.end(),
                        score=0.98,
                        detector=self.name,
                        rule_id="IN_AADHAAR.verhoeff.v1",
                        validated=True,
                        reason="Validated 12-digit Indian Aadhaar number with Verhoeff checksum.",
                        also_detected_as=[],
                    )
                )
                claimed_spans.add(span)

        # 4. IN_IFSC (11 characters)
        for match in IFSC_CANDIDATE_REGEX.finditer(text):
            val = match.group(1).upper()
            # 5th char must be '0'
            if len(val) == 11 and val[4] == "0":
                span = (match.start(), match.end())
                findings.append(
                    Finding(
                        id=f"in_ifsc_{match.start()}",
                        category=Category.FINANCIAL,
                        entity_type="IN_IFSC",
                        start=match.start(),
                        end=match.end(),
                        score=0.92,
                        detector=self.name,
                        rule_id="IN_IFSC.structure.v1",
                        validated=True,
                        reason="Validated Indian Financial System Code (IFSC) branch code.",
                        also_detected_as=[],
                    )
                )
                claimed_spans.add(span)

        # 5. IN_MOBILE (10 digits starting 6-9, optional +91/91/0 prefix)
        for match in MOBILE_CANDIDATE_REGEX.finditer(text):
            span = (match.start(), match.end())
            # Skip if inside claimed span (e.g. Aadhaar digits)
            if any(s <= span[0] and span[1] <= e for s, e in claimed_spans):
                continue
            findings.append(
                Finding(
                    id=f"in_mobile_{match.start()}",
                    category=Category.PII,
                    entity_type="IN_MOBILE",
                    start=match.start(),
                    end=match.end(),
                    score=0.88,
                    detector=self.name,
                    rule_id="IN_MOBILE.pattern.v1",
                    validated=None,
                    reason="Identified 10-digit Indian mobile telephone number pattern.",
                    also_detected_as=[],
                )
            )
            claimed_spans.add(span)

        # 6. UPI_ID (name@handle where handle is in verified UPI list, no dot in handle)
        for match in UPI_CANDIDATE_REGEX.finditer(text):
            handle = match.group(2).lower()
            if handle in UPI_HANDLES:
                span = (match.start(), match.end())
                findings.append(
                    Finding(
                        id=f"upi_id_{match.start()}",
                        category=Category.FINANCIAL,
                        entity_type="UPI_ID",
                        start=match.start(),
                        end=match.end(),
                        score=0.92,
                        detector=self.name,
                        rule_id="UPI_ID.vpa.v1",
                        validated=True,
                        reason="Identified Unified Payments Interface (UPI) Virtual Payment Address (VPA).",
                        also_detected_as=[],
                    )
                )
                claimed_spans.add(span)

        # 7. IN_BANK_ACCOUNT (9-18 digits strictly requiring preceding local context words)
        for match in BANK_ACCOUNT_DIGITS_REGEX.finditer(text):
            span = (match.start(), match.end())
            # Skip if already identified as Aadhaar, Mobile, etc.
            if any(s <= span[0] and span[1] <= e for s, e in claimed_spans):
                continue

            # Look up to 60 characters before the digits for context keywords
            lookback_start = max(0, match.start() - 60)
            prefix_window = text[lookback_start : match.start()]

            # Must find a context keyword in the prefix window
            if BANK_ACCOUNT_CONTEXT_REGEX.search(prefix_window):
                findings.append(
                    Finding(
                        id=f"in_bank_account_{match.start()}",
                        category=Category.FINANCIAL,
                        entity_type="IN_BANK_ACCOUNT",
                        start=match.start(),
                        end=match.end(),
                        score=0.85,
                        detector=self.name,
                        rule_id="IN_BANK_ACCOUNT.context.v1",
                        validated=True,
                        reason="Identified bank account number accompanied by local financial context keywords.",
                        also_detected_as=[],
                    )
                )
                claimed_spans.add(span)

        return findings
