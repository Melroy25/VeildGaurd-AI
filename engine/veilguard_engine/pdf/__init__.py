"""PDF package: in-memory scanning, true redaction, and dual-extractor verification."""

from veilguard_engine.pdf.models import PDFFinding, PDFScanResponse
from veilguard_engine.pdf.processor import (
    InvalidPDFError,
    PDFLimitExceededError,
    RedactionVerificationError,
    redact_pdf,
    scan_pdf,
    validate_pdf_limits,
)

__all__ = [
    "PDFFinding",
    "PDFScanResponse",
    "PDFLimitExceededError",
    "InvalidPDFError",
    "RedactionVerificationError",
    "validate_pdf_limits",
    "scan_pdf",
    "redact_pdf",
]
