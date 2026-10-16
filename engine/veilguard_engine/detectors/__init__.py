"""Detectors package for VeilGuard privacy engine."""

from veilguard_engine.detectors.base import Detector
from veilguard_engine.detectors.india import IndiaDetector
from veilguard_engine.detectors.presidio_detector import PresidioDetector
from veilguard_engine.detectors.secrets import SecretsDetector
from veilguard_engine.detectors.watchlist import WatchlistDetector

__all__ = [
    "Detector",
    "IndiaDetector",
    "PresidioDetector",
    "SecretsDetector",
    "WatchlistDetector",
]
