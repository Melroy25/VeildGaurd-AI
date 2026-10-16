"""Phase 0 Smoke Tests for VeilGuard AI Engine.

These smoke tests verify that the Python toolchain, server skeleton,
NLP libraries (spaCy, Presidio), and PDF tools (PyMuPDF) operate
correctly without errors. All test data is strictly synthetic.
"""

from fastapi.testclient import TestClient
import fitz  # PyMuPDF
from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider
import spacy
from veilguard_engine import config
from veilguard_engine.server import app


def test_config_binds_to_loopback_only() -> None:
    """Security Invariant (Rule 5): Engine must bind strictly to 127.0.0.1."""
    assert config.HOST == "127.0.0.1", f"Host must be loopback only, got {config.HOST}"
    assert config.PORT == 8765, f"Expected port 8765, got {config.PORT}"


def test_health_endpoint() -> None:
    """Smoke test: GET /health returns HTTP 200 and expected status/version."""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "0.0.1"}


def test_spacy_model_loads() -> None:
    """Toolchain check: spaCy en_core_web_sm model loads without error."""
    nlp = spacy.load("en_core_web_sm")
    doc = nlp("This is a synthetic test sentence.")
    assert len(doc) > 0


def test_presidio_analyzer_toolchain() -> None:
    """Toolchain check: Presidio AnalyzerEngine instantiates with en_core_web_sm.

    This verifies toolchain linkage only, not detection-quality accuracy.
    Test sentence uses strictly synthetic dummy data.
    """
    provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
        }
    )
    nlp_engine = provider.create_engine()
    analyzer = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])

    synthetic_sample = "Synthetic John Doe with phone 555-0199 and email user@example.com."
    results = analyzer.analyze(text=synthetic_sample, language="en")
    assert isinstance(results, list)


def test_pymupdf_in_memory_creation_and_extraction() -> None:
    """Toolchain check: PyMuPDF can generate and re-extract an in-memory synthetic PDF."""
    synthetic_text = "Synthetic confidential invoice #998811"

    # Create document in memory
    doc = fitz.open()
    page = doc.new_page(width=300, height=300)
    page.insert_text((50, 50), synthetic_text)

    # Save to bytes stream
    pdf_bytes = doc.tobytes()
    doc.close()

    # Re-open and verify extraction
    reopened = fitz.open(stream=pdf_bytes, filetype="pdf")
    extracted_page = reopened[0]
    extracted_text = extracted_page.get_text()
    reopened.close()

    assert synthetic_text in extracted_text
