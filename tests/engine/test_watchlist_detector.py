"""Unit tests for WatchlistDetector."""

import tempfile
from pathlib import Path
import pytest
import yaml

from veilguard_engine.detectors.watchlist import WatchlistDetector


@pytest.fixture
def temp_watchlist_file():
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False, encoding="utf-8") as f:
        yaml.dump({"terms": ["Project Titan", "VexoraSecret", "Apollo11"]}, f)
        temp_path = f.name

    yield temp_path
    Path(temp_path).unlink(missing_ok=True)


def test_watchlist_matches_case_insensitively(temp_watchlist_file):
    detector = WatchlistDetector(filepath=temp_watchlist_file)
    text = "Status update on project titan and VEXORASECRET deployment."
    findings = detector.detect(text)

    assert len(findings) == 2
    matched_words = [text[f.start:f.end] for f in findings]
    assert "project titan" in matched_words
    assert "VEXORASECRET" in matched_words


def test_watchlist_whole_word_only(temp_watchlist_file):
    detector = WatchlistDetector(filepath=temp_watchlist_file)
    # "Apollo11" is on the watchlist; "Apollo110" or "PreApollo11" must NOT match
    text = "We tested Apollo110 and PreApollo11 in staging."
    findings = detector.detect(text)
    assert len(findings) == 0


def test_watchlist_missing_file_returns_empty_not_error():
    detector = WatchlistDetector(filepath="non_existent_watchlist_12345.yaml")
    assert detector.terms == []
    assert detector.detect("Any text referencing confidential project titan") == []
