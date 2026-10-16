"""Base detector protocol for VeilGuard privacy engine."""

from typing import List, Protocol
from veilguard_engine.models import Finding


class Detector(Protocol):
    """Protocol for independent detection modules."""
    name: str

    def detect(self, text: str) -> List[Finding]:
        """Inspect input text and return a list of findings."""
        ...
