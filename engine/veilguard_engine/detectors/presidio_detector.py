"""Microsoft Presidio analyzer wrapper detector.

Executes stock Presidio recognizers without modifying the underlying registry,
enabling clean baseline comparison in Phase 6.
"""

from typing import List, Optional
from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider

from veilguard_engine import config
from veilguard_engine.models import Finding, get_category_for_entity


DEFAULT_PRESIDIO_ENTITIES: list[str] = [
    "PERSON",
    "PHONE_NUMBER",
    "EMAIL_ADDRESS",
    "EMAIL",
    "CREDIT_CARD",
    "IBAN_CODE",
    "IP_ADDRESS",
    "LOCATION",
    "CRYPTO",
    "MEDICAL_LICENSE",
]


class PresidioDetector:
    """Wrapper around Microsoft Presidio AnalyzerEngine."""

    name: str = "presidio"

    def __init__(
        self,
        entities: Optional[List[str]] = DEFAULT_PRESIDIO_ENTITIES,
        spacy_model: Optional[str] = None,
        analyzer_engine: Optional[AnalyzerEngine] = None,
    ):
        """Initialize Presidio AnalyzerEngine once.

        Args:
            entities: Optional list of entities to scan for. If None, scans for all
                      entities supported by Presidio (unfiltered baseline mode).
            spacy_model: spaCy model name to load (defaults to config.SPACY_MODEL).
            analyzer_engine: Optional pre-built AnalyzerEngine for testing/dependency injection.
        """
        self.entities = entities
        self.spacy_model = spacy_model or config.SPACY_MODEL

        if analyzer_engine is not None:
            self.analyzer = analyzer_engine
        else:
            nlp_configuration = {
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "en", "model_name": self.spacy_model}],
            }
            provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
            nlp_engine = provider.create_engine()
            self.analyzer = AnalyzerEngine(nlp_engine=nlp_engine)

    def detect(self, text: str) -> List[Finding]:
        """Analyze text using Presidio and convert results to Finding models."""
        if not text:
            return []

        results = self.analyzer.analyze(
            text=text,
            language="en",
            entities=self.entities,
        )

        findings: List[Finding] = []
        for idx, res in enumerate(results):
            # Normalize EMAIL to EMAIL_ADDRESS for consistent category & entity mapping
            entity_type = "EMAIL_ADDRESS" if res.entity_type == "EMAIL" else res.entity_type
            category = get_category_for_entity(entity_type)
            rule_id = f"presidio.{entity_type.lower()}"
            reason = f"Identified potential {entity_type} via Presidio statistical/pattern analyzer."

            findings.append(
                Finding(
                    id=f"presidio_{idx}",
                    category=category,
                    entity_type=entity_type,
                    start=res.start,
                    end=res.end,
                    score=float(res.score),
                    detector=self.name,
                    rule_id=rule_id,
                    validated=None,
                    reason=reason,
                    also_detected_as=[],
                )
            )

        return findings
