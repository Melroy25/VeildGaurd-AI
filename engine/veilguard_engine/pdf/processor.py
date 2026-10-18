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
import re
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


def _get_placeholder(
    entity_type: str,
    type_counters: Dict[str, int],
    text: str = "",
    start: int = 0,
) -> str:
    """Generate consistent placeholder labels."""
    type_upper = entity_type.upper()
    if type_upper == "PERSON":
        role = None
        if text and start > 0:
            prefix = text[:start]
            tokens = re.findall(r"\b[A-Za-z0-9_-]+\b", prefix)
            if tokens:
                window = [t.lower() for t in tokens[-3:]]
                for tok in reversed(window):
                    if tok in ("patient", "client", "customer", "employee", "candidate", "student", "user"):
                        role = tok.upper()
                        break
        label = role if role else "CUSTOMER"
        type_counters[label] = type_counters.get(label, 0) + 1
        return f"[{label}_{type_counters[label]}]"
    elif type_upper in ("PHONE_NUMBER", "IN_MOBILE"):
        type_counters["PHONE"] = type_counters.get("PHONE", 0) + 1
        return f"[PHONE_{type_counters['PHONE']}]"
    elif type_upper in ("EMAIL", "EMAIL_ADDRESS"):
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
        type_counters["CARD"] = type_counters.get("CARD", 0) + 1
        return f"[CARD_{type_counters['CARD']}]"
    elif "ACCOUNT" in type_upper or "BANK" in type_upper:
        type_counters["ACCOUNT"] = type_counters.get("ACCOUNT", 0) + 1
        return f"[ACCOUNT_{type_counters['ACCOUNT']}]"
    elif "MEDICAL" in type_upper or "HEALTH" in type_upper:
        type_counters["HEALTH"] = type_counters.get("HEALTH", 0) + 1
        return f"[HEALTH_{type_counters['HEALTH']}]"
    else:
        type_counters[type_upper] = type_counters.get(type_upper, 0) + 1
        return f"[{type_upper}_{type_counters[type_upper]}]"


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
                placeholder = _get_placeholder(f.entity_type, type_counters, text=page_text, start=f.start)
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
    type_counters: Dict[str, int] = {}

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
                placeholder = _get_placeholder(
                    f.entity_type,
                    type_counters,
                    text=page_text,
                    start=f.start,
                )
                rects = page.search_for(raw_entity)
                for r in rects:
                    base_len = fitz.get_text_length(placeholder, fontname="helv", fontsize=9.0)
                    fs = min(9.0, max(5.0, 9.0 * ((r.width - 2) / max(base_len, 1.0)))) if base_len > 0 else 9.0
                    page.add_redact_annot(
                        r,
                        text=placeholder,
                        fontname="helv",
                        fontsize=fs,
                        fill=(0.94, 0.96, 0.99),
                        text_color=(0.12, 0.35, 0.75),
                        align=fitz.TEXT_ALIGN_CENTER,
                    )

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
