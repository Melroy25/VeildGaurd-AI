"""Pydantic schemas for PDF scanning and redaction endpoints.

Complies with Rule 7 (Zero Raw Content Persistence):
Finding schemas contain bounding boxes, categories, types, and placeholders,
NEVER raw entity values or extracted prompt text.
"""

from typing import List
from pydantic import BaseModel, Field

from veilguard_engine.models import Category


class PDFFinding(BaseModel):
    """An identified sensitive entity occurrence within a PDF page."""
    page: int = Field(ge=0, description="0-indexed page number where entity was located")
    rect: List[float] = Field(description="[x0, y0, x1, y1] bounding box in PDF coordinate space")
    category: Category = Field(description="High-level risk category")
    entity_type: str = Field(description="Classified entity type (e.g. PERSON, IN_AADHAAR)")
    placeholder: str = Field(description="Utility-preserving placeholder, e.g. [CUSTOMER_1]")
    reason: str = Field(description="Templated explanation; NEVER contains matched raw text")


class PDFScanResponse(BaseModel):
    """Metadata response for POST /pdf/scan."""
    total_pages: int = Field(ge=1, description="Number of pages in the analyzed document")
    file_size_bytes: int = Field(ge=0, description="Size of uploaded document in bytes")
    findings_count: int = Field(ge=0, description="Total number of sensitive findings detected")
    findings: List[PDFFinding] = Field(default_factory=list, description="List of detected sensitive entity bounding boxes")
    notices: List[str] = Field(default_factory=list, description="Usage and limitation notices")
