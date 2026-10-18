"""In-memory PDF scanner, true redaction, and dual-extractor verification engine.

Invariants & Constraints:
- Rule 7: Zero Raw Content Persistence. PDF bytes stay strictly in-memory.
  Never written to disk, temporary files, telemetry, or logs.
- True Redaction: PyMuPDF removes the underlying glyphs and vector stream,
  not merely overlaying visual masks.
- Metadata & XMP Scrubbing: Completely wipes document information and XML metadata.
- Dual-Extractor Verification: Cross-verifies output with PyMuPDF AND pypdf to
  guarantee zero residual target strings.
"""

from __future__ import annotations

import io
from typing import Dict, List, Set, Tuple

import fitz  # PyMuPDF
import pypdf

from veilguard_engine.pdf.models import PDFFinding, PDFScanResponse
from veilguard_engine.scanner import Scanner

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit
MAX_PAGE_COUNT = 50                     # 50 page limit


class PDFLimitExceededError(ValueError):
    """Raised when a PDF exceeds size or page count limits."""
    pass


class InvalidPDFError(ValueError):
    """Raised when uploaded data is not a valid PDF document."""
    pass


class RedactionVerificationError(RuntimeError):
    """Raised when dual-extractor verification detects residual sensitive text."""
    pass


def _get_placeholder(entity_type: str, type_counters: Dict[str, int]) -> str:
    """Generate consistent placeholder labels."""
    type_upper = entity_type.upper()
    if type_upper == "PERSON":
        type_counters["CUSTOMER"] = type_counters.get("CUSTOMER", 0) + 1
        return f"[CUSTOMER_{type_counters['CUSTOMER']}]"
    elif type_upper in ("PHONE_NUMBER", "IN_MOBILE"):
        type_counters["PHONE"] = type_counters.get("PHONE", 0) + 1
        return f"[PHONE_{type_counters['PHONE']}]"
    elif type_upper == "EMAIL_ADDRESS":
        type_counters["EMAIL"] = type_counters.get("EMAIL", 0) + 1
        return f"[EMAIL_{type_counters['EMAIL']}]"
    elif type_upper == "IN_AADHAAR":
        type_counters["AADHAAR"] = type_counters.get("AADHAAR", 0) + 1
        return f"[AADHAAR_{type_counters['AADHAAR']}]"
    elif type_upper == "IN_PAN":
        type_counters["PAN"] = type_counters.get("PAN", 0) + 1
        return f"[PAN_{type_counters['PAN']}]"
    elif "SECRET" in type_upper or "KEY" in type_upper or "TOKEN" in type_upper:
        return "[CRITICAL_SECRET]"
    elif "CREDIT" in type_upper or "CARD" in type_upper:
        return "[CARD_MASKED]"
    elif "MEDICAL" in type_upper:
        return "[HEALTH_DETAIL]"
    else:
        return f"[{type_upper}]"


def validate_pdf_limits(pdf_bytes: bytes) -> fitz.Document:
    """Enforce 10 MB and 50 page boundaries in-memory."""
    if len(pdf_bytes) > MAX_FILE_SIZE_BYTES:
        raise PDFLimitExceededError(
            f"PDF file size ({len(pdf_bytes)} bytes) exceeds maximum limit of 10 MB"
        )
    if not pdf_bytes.startswith(b"%PDF"):
        raise InvalidPDFError("File does not start with valid PDF magic bytes (%PDF)")

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise InvalidPDFError(f"Failed to parse PDF document stream: {exc}") from exc

    if len(doc) > MAX_PAGE_COUNT:
        page_count = len(doc)
        doc.close()
        raise PDFLimitExceededError(
            f"PDF page count ({page_count}) exceeds maximum limit of {MAX_PAGE_COUNT} pages"
        )
    if len(doc) == 0:
        doc.close()
        raise InvalidPDFError("PDF contains 0 pages")

    return doc


def scan_pdf(
    pdf_bytes: bytes,
    scanner: Scanner,
    profile: str = "company",
) -> PDFScanResponse:
    """Scan PDF pages in-memory and return bounding boxes without raw text."""
    doc = validate_pdf_limits(pdf_bytes)
    findings: List[PDFFinding] = []
    type_counters: Dict[str, int] = {}

    try:
        for page_idx, page in enumerate(doc):
            page_text = page.get_text("text")
            if not page_text or not page_text.strip():
                continue

            scan_res = scanner.scan(page_text, source="document")
            for f in scan_res.findings:
                raw_entity = page_text[f.start:f.end]
                placeholder = _get_placeholder(f.entity_type, type_counters)
                rects = page.search_for(raw_entity)
                for r in rects:
                    findings.append(
                        PDFFinding(
                            page=page_idx,
                            rect=[round(r.x0, 2), round(r.y0, 2), round(r.x1, 2), round(r.y1, 2)],
                            category=f.category,
                            entity_type=f.entity_type,
                            placeholder=placeholder,
                            reason=f.reason,
                        )
                    )
        return PDFScanResponse(
            total_pages=len(doc),
            file_size_bytes=len(pdf_bytes),
            findings_count=len(findings),
            findings=findings,
            notices=[
                "Processed in-memory. Zero raw content stored.",
                "Scanned vector/text stream. Scanned raster images without OCR layer require OCR preprocessing.",
            ],
        )
    finally:
        doc.close()


def redact_pdf(
    pdf_bytes: bytes,
    scanner: Scanner,
    profile: str = "company",
) -> Tuple[bytes, int]:
    """Apply true redactions, scrub metadata, and dual-verify sanitization."""
    doc = validate_pdf_limits(pdf_bytes)
    targets_to_verify: Set[str] = set()

    try:
        for page in doc:
            page_text = page.get_text("text")
            if not page_text or not page_text.strip():
                continue

            scan_res = scanner.scan(page_text, source="document")
            for f in scan_res.findings:
                raw_entity = page_text[f.start:f.end].strip()
                if not raw_entity:
                    continue
                targets_to_verify.add(raw_entity)
                rects = page.search_for(raw_entity)
                for r in rects:
                    page.add_redact_annot(r, fill=(0, 0, 0))

            # PyMuPDF removes underlying vector paths, text characters, and stream bytes
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        # Metadata & XML scrubbing
        doc.set_metadata({})
        if hasattr(doc, "del_xml_metadata"):
            doc.del_xml_metadata()

        sanitized_bytes = doc.tobytes(garbage=4, deflate=True, clean=True)
    finally:
        doc.close()

    # --- Dual-Extractor Verification ---
    # 1. Extractor A: PyMuPDF text stream extraction
    doc_verify = fitz.open(stream=sanitized_bytes, filetype="pdf")
    try:
        text_pymupdf = " ".join(p.get_text("text") for p in doc_verify)
    finally:
        doc_verify.close()

    # 2. Extractor B: pypdf independent parser
    try:
        reader = pypdf.PdfReader(io.BytesIO(sanitized_bytes))
        text_pypdf = " ".join(p.extract_text() or "" for p in reader.pages)
    except Exception as exc:
        raise RedactionVerificationError(f"pypdf failed to parse sanitized output: {exc}") from exc

    # Assert zero residual target strings in either extractor
    for target in targets_to_verify:
        if target in text_pymupdf:
            raise RedactionVerificationError(
                "PyMuPDF verification failed: residual sensitive target detected in sanitized text"
            )
        if target in text_pypdf:
            raise RedactionVerificationError(
                "pypdf verification failed: residual sensitive target detected in sanitized text"
            )

    return sanitized_bytes, len(targets_to_verify)
