"""bench/baselines/presidio_baselines.py — Stock Presidio baselines.

Two systems:
  presidio_default   — AnalyzerEngine(), default registry, entities=None
  presidio_all_stock — same engine + all recognizers from AllRecognizer registry
                       (includes Indian recognizers if available in the installed version)

Sanitizer: Presidio's AnonymizerEngine with EntityAnonymizer replacing each
entity with [<entity_type>] for uniform comparison.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig


@dataclass
class PresidioFinding:
    start: int
    end: int
    entity_type: str
    score: float


class _PresidioBase:
    """Shared logic for the two Presidio baselines."""

    def __init__(self, engine: AnalyzerEngine) -> None:
        self._engine = engine
        self._anonymizer = AnonymizerEngine()

    def detect(self, text: str) -> List[PresidioFinding]:
        results = self._engine.analyze(text=text, language="en")
        return [
            PresidioFinding(
                start=r.start,
                end=r.end,
                entity_type=r.entity_type,
                score=r.score,
            )
            for r in results
        ]

    def sanitize(self, text: str) -> str:
        results = self._engine.analyze(text=text, language="en")
        if not results:
            return text
        # Build per-entity-type operator config
        operators = {
            r.entity_type: OperatorConfig("replace", {"new_value": f"[{r.entity_type}]"})
            for r in results
        }
        anonymized = self._anonymizer.anonymize(
            text=text, analyzer_results=results, operators=operators
        )
        return anonymized.text

    def is_flagged(self, text: str) -> bool:
        return len(self.detect(text)) > 0


class PresidioDefault(_PresidioBase):
    """Stock Presidio: default AnalyzerEngine, default recognizers, entities=None."""

    def __init__(self) -> None:
        engine = AnalyzerEngine()
        super().__init__(engine)

    def detect(self, text: str) -> List[PresidioFinding]:
        results = self._engine.analyze(text=text, language="en", entities=None)
        return [
            PresidioFinding(start=r.start, end=r.end, entity_type=r.entity_type, score=r.score)
            for r in results
        ]

    def sanitize(self, text: str) -> str:
        results = self._engine.analyze(text=text, language="en", entities=None)
        if not results:
            return text
        operators = {
            r.entity_type: OperatorConfig("replace", {"new_value": f"[{r.entity_type}]"})
            for r in results
        }
        return self._anonymizer.anonymize(text=text, analyzer_results=results, operators=operators).text


class PresidioAllStock(_PresidioBase):
    """Presidio with all predefined recognizers enabled.

    Loads every recognizer in the default registry. If the installed Presidio
    version includes Indian recognizers (IN_PAN, IN_AADHAAR etc.) they are
    included automatically.
    """

    def __init__(self) -> None:
        from presidio_analyzer.predefined_recognizers import (
            InAadhaarRecognizer,
            InGstinRecognizer,
            InPanRecognizer,
            InPassportRecognizer,
            InVehicleRegistrationRecognizer,
            InVoterRecognizer,
        )

        registry = RecognizerRegistry()
        registry.load_predefined_recognizers(languages=["en"])
        for rec_cls in (
            InAadhaarRecognizer,
            InGstinRecognizer,
            InPanRecognizer,
            InPassportRecognizer,
            InVehicleRegistrationRecognizer,
            InVoterRecognizer,
        ):
            registry.add_recognizer(rec_cls())
        engine = AnalyzerEngine(registry=registry)
        super().__init__(engine)

    def detect(self, text: str) -> List[PresidioFinding]:
        results = self._engine.analyze(text=text, language="en", entities=None)
        return [
            PresidioFinding(start=r.start, end=r.end, entity_type=r.entity_type, score=r.score)
            for r in results
        ]

    def sanitize(self, text: str) -> str:
        results = self._engine.analyze(text=text, language="en", entities=None)
        if not results:
            return text
        operators = {
            r.entity_type: OperatorConfig("replace", {"new_value": f"[{r.entity_type}]"})
            for r in results
        }
        return self._anonymizer.anonymize(text=text, analyzer_results=results, operators=operators).text
