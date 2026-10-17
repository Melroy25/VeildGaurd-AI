"""Data models and API schemas for VeilGuard local privacy engine.

Enforces Rule 7 and Phase 2 Privacy Property:
Findings return character offsets, entity types, categories, and templated reasons,
NEVER the raw sensitive substring.
"""

from enum import Enum
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class Category(str, Enum):
    PII = "PII"
    FINANCIAL = "FINANCIAL"
    GOVERNMENT_ID = "GOVERNMENT_ID"
    SECRET = "SECRET"
    CONFIDENTIAL = "CONFIDENTIAL"
    MEDICAL = "MEDICAL"
    QUASI_IDENTIFIER = "QUASI_IDENTIFIER"


ENTITY_CATEGORY_MAP: dict[str, Category] = {
    # Standard PII
    "PERSON": Category.PII,
    "PHONE_NUMBER": Category.PII,
    "EMAIL_ADDRESS": Category.PII,
    "EMAIL": Category.PII,
    "LOCATION": Category.PII,
    "IP_ADDRESS": Category.PII,
    "IN_MOBILE": Category.PII,

    # Financial Identifiers
    "CREDIT_CARD": Category.FINANCIAL,
    "IBAN_CODE": Category.FINANCIAL,
    "CRYPTO": Category.FINANCIAL,
    "IN_BANK_ACCOUNT": Category.FINANCIAL,
    "IN_IFSC": Category.FINANCIAL,
    "UPI_ID": Category.FINANCIAL,

    # Government Identifiers
    "IN_AADHAAR": Category.GOVERNMENT_ID,
    "IN_PAN": Category.GOVERNMENT_ID,
    "IN_GSTIN": Category.GOVERNMENT_ID,
    "US_SSN": Category.GOVERNMENT_ID,
    "US_PASSPORT": Category.GOVERNMENT_ID,
    "US_DRIVER_LICENSE": Category.GOVERNMENT_ID,
    "US_ITIN": Category.GOVERNMENT_ID,
    "UK_NHS": Category.GOVERNMENT_ID,

    # Secrets & Credentials
    "API_KEY": Category.SECRET,
    "AWS_ACCESS_KEY": Category.SECRET,
    "GITHUB_TOKEN": Category.SECRET,
    "SLACK_TOKEN": Category.SECRET,
    "GOOGLE_API_KEY": Category.SECRET,
    "STRIPE_KEY": Category.SECRET,
    "JWT_TOKEN": Category.SECRET,
    "PRIVATE_KEY": Category.SECRET,
    "CONNECTION_STRING": Category.SECRET,
    "GENERIC_SECRET": Category.SECRET,

    # Watchlist / Proprietary
    "WATCHLIST_TERM": Category.CONFIDENTIAL,
    "CONFIDENTIAL_TERM": Category.CONFIDENTIAL,

    # Medical (Phase 5)
    "MEDICAL_CONDITION": Category.MEDICAL,
    "MEDICATION": Category.MEDICAL,
    "MEDICAL_PROCEDURE": Category.MEDICAL,
    "MEDICAL_LICENSE": Category.MEDICAL,

    # Quasi-identifiers (Phase 5)
    "QUASI_AGE": Category.QUASI_IDENTIFIER,
    "QUASI_ROLE": Category.QUASI_IDENTIFIER,
    "QUASI_ORG": Category.QUASI_IDENTIFIER,
    "QUASI_LOCATION": Category.QUASI_IDENTIFIER,
    "QUASI_EVENT": Category.QUASI_IDENTIFIER,
    "QUASI_GENDER": Category.QUASI_IDENTIFIER,
}


def get_category_for_entity(entity_type: str) -> Category:
    """Return the designated Category for an entity type with a safe default."""
    return ENTITY_CATEGORY_MAP.get(entity_type.upper(), Category.PII)


class Finding(BaseModel):
    """A detected privacy or security entity finding.

    Strict invariant: contains no matched raw text.
    """
    id: str = Field(description="Stable identifier within response, e.g. f1, f2")
    category: Category = Field(description="High-level privacy/security risk category")
    entity_type: str = Field(description="Specific entity classification (e.g. IN_AADHAAR, PERSON)")
    start: int = Field(ge=0, description="0-indexed start character offset in input text")
    end: int = Field(gt=0, description="0-indexed exclusive end character offset in input text")
    score: float = Field(ge=0.0, le=1.0, description="Detection confidence score between 0.0 and 1.0")
    detector: str = Field(description="Name of the detector module that identified the finding")
    rule_id: str = Field(description="Stable rule identifier, e.g. IN_AADHAAR.verhoeff.v1")
    validated: Optional[bool] = Field(
        default=None,
        description="True/False if checksum/structure validator ran, None if no validator applies"
    )
    reason: str = Field(
        description="Templated human-readable explanation of why entity was flagged; NEVER contains matched text"
    )
    also_detected_as: List[str] = Field(
        default_factory=list,
        description="Other entity classifications detected on this span overridden by overlap resolution"
    )


class ScanRequest(BaseModel):
    """Payload for POST /scan endpoint."""
    text: str = Field(
        ...,
        min_length=1,
        max_length=200_000,
        description="Input text content to be inspected for sensitive data"
    )
    source: Literal["prompt", "document"] = Field(
        default="prompt",
        description="Source of input text: prompt submission or document extraction"
    )


class ScanStats(BaseModel):
    """Execution metadata and performance metrics for a scan request."""
    text_length: int = Field(ge=0, description="Length of input text in characters")
    latency_ms: float = Field(ge=0.0, description="Engine processing latency in milliseconds")
    detectors: List[str] = Field(description="List of detector names that executed")
    spacy_model: str = Field(description="spaCy model name utilized for NLP processing")


class ScanResponse(BaseModel):
    """Response returned by POST /scan endpoint."""
    offset_unit: Literal["utf16"] = Field(
        default="utf16",
        description="Unit for start/end offsets in findings: utf16 code units for JavaScript string compatibility",
    )
    findings: List[Finding] = Field(description="List of detected findings sorted by start offset")
    stats: ScanStats = Field(description="Scan execution statistics")


from veilguard_engine.policy.models import AppliedRule, Decision, DestinationTrust
from veilguard_engine.sanitizer.models import KnownPlaceholder, SanitizeResult


class AnalyzeRequest(BaseModel):
    """Payload for POST /analyze endpoint."""
    text: str = Field(
        ...,
        min_length=1,
        max_length=200_000,
        description="Input text content to be inspected and analyzed for policy enforcement",
    )
    source: Literal["prompt", "document"] = Field(
        default="prompt",
        description="Source of input text: prompt submission or document extraction",
    )
    destination: str = Field(
        default="127.0.0.1",
        description="Target destination hostname (e.g. chatgpt.com, api.openai.com, 127.0.0.1)",
    )
    profile: Optional[str] = Field(
        default=None,
        description="Policy profile to evaluate against (defaults to 'company')",
    )
    known_placeholders: Optional[List[KnownPlaceholder]] = Field(
        default=None,
        description="Optional seed list of previously assigned placeholders for session consistency",
    )


class AnalyzeStats(BaseModel):
    """Execution metadata and performance metrics for an analyze request."""
    latency_ms: float = Field(ge=0.0, description="Total pipeline processing latency in milliseconds")
    profile: str = Field(description="Policy profile applied")
    destination_trust: DestinationTrust = Field(description="Resolved destination trust level")
    scan_stats: ScanStats = Field(description="Underlying scan performance metrics")


class AnalyzeResponse(BaseModel):
    """Response returned by POST /analyze endpoint."""
    offset_unit: Literal["utf16"] = Field(
        default="utf16",
        description="Unit for start/end offsets in findings and replacements: utf16 code units",
    )
    decision: Decision = Field(description="Strongest policy decision: allow, redact, require_approval, block")
    options: List[str] = Field(description="Valid user actions based on decision")
    summary: str = Field(description="Plain-language decision explanation without sensitive content")
    applied_rules: List[AppliedRule] = Field(description="List of policy rules that triggered")
    findings: List[Finding] = Field(description="Detected findings with UTF-16 offsets")
    sanitization: Optional[SanitizeResult] = Field(
        default=None,
        description="Sanitization results including sanitized text and replacements (null if decision is allow)",
    )
    notices: List[str] = Field(
        default_factory=lambda: ["Detection is not exhaustive. Review the text before sending."],
        description="Important safety notices and user disclosures",
    )
    stats: AnalyzeStats = Field(description="Performance and pipeline execution statistics")


class RuleInfo(BaseModel):
    rule_id: str
    reason: str


class ProfileInfo(BaseModel):
    profile: str
    description: str
    rules: List[RuleInfo]


