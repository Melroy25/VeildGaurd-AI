"""bench/baselines/veilguard_baselines.py — VeilGuard type-based and full baselines.

Two systems:
  veilguard_type_based — Phase 3a behavior: scanner + policy, all Phase 5
                         intelligence flags OFF.
  veilguard_full       — all intelligence flags ON (populated in Part C).

Feature flags (env-var based, each defaults OFF so this file is safe to
commit before Part C code exists):

  VEILGUARD_INTELLIGENCE=1    master switch
  VEILGUARD_TASK=1            task profile inference
  VEILGUARD_NECESSITY=1       necessity scoring
  VEILGUARD_REID=1            quasi-identifier + re-ID scoring
  VEILGUARD_MEDICAL=1         medical detector
  VEILGUARD_ROLE_PH=1         role-based placeholders
"""

from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

# ─── Path setup ───────────────────────────────────────────────────────────────
ENGINE_PATH = Path(__file__).resolve().parent.parent.parent / "engine"
if str(ENGINE_PATH) not in sys.path:
    sys.path.insert(0, str(ENGINE_PATH))

from veilguard_engine.scanner import Scanner
from veilguard_engine.policy import PolicyEvaluator, PolicyRegistry
from veilguard_engine.policy.models import Decision
from veilguard_engine.sanitizer import Sanitizer


# ─── Feature flags ────────────────────────────────────────────────────────────

def _flag(name: str) -> bool:
    return os.getenv(name, "0").lower() in ("1", "true", "yes")


class FeatureFlags:
    """Runtime-configurable intelligence feature flags."""

    def __init__(
        self,
        intelligence: bool = False,
        task: bool = False,
        necessity: bool = False,
        reid: bool = False,
        medical: bool = False,
        role_ph: bool = False,
    ) -> None:
        self.intelligence = intelligence
        self.task = task
        self.necessity = necessity
        self.reid = reid
        self.medical = medical
        self.role_ph = role_ph

    @classmethod
    def from_env(cls) -> "FeatureFlags":
        """Read flags from environment variables."""
        master = _flag("VEILGUARD_INTELLIGENCE")
        return cls(
            intelligence=master,
            task=master and _flag("VEILGUARD_TASK"),
            necessity=master and _flag("VEILGUARD_NECESSITY"),
            reid=master and _flag("VEILGUARD_REID"),
            medical=master and _flag("VEILGUARD_MEDICAL"),
            role_ph=master and _flag("VEILGUARD_ROLE_PH"),
        )

    @classmethod
    def all_on(cls) -> "FeatureFlags":
        return cls(intelligence=True, task=True, necessity=True, reid=True, medical=True, role_ph=True)

    @classmethod
    def all_off(cls) -> "FeatureFlags":
        return cls()


# ─── Result type ──────────────────────────────────────────────────────────────

@dataclass
class VeilGuardResult:
    decision: str           # allow / redact / require_approval / block
    sanitized_text: str     # text after sanitization (same as input if allow)
    finding_count: int
    latency_ms: float


# ─── Shared VeilGuard runner ───────────────────────────────────────────────────

class _VeilGuardBase:
    """Shared pipeline: scanner → policy → sanitizer."""

    # Singletons — avoid re-loading spaCy on each call
    _scanner: Optional[Scanner] = None
    _registry: Optional[PolicyRegistry] = None

    def __init__(self, flags: FeatureFlags) -> None:
        self._flags = flags
        self._init_pipeline()

    @classmethod
    def _init_pipeline(cls) -> None:
        if cls._scanner is None:
            cls._scanner = Scanner()
        if cls._registry is None:
            cls._registry = PolicyRegistry()

    def run(self, text: str, profile: str = "company", destination: str = "127.0.0.1") -> VeilGuardResult:
        """Run the full VeilGuard analysis pipeline.

        Phase 5 intelligence features are gated behind self._flags.
        In Part C those flags actually activate new detectors;
        in Part B they are always off so both type_based and full behave identically.
        """
        t0 = time.perf_counter()

        scanner = self._scanner
        registry = self._registry

        # Scan
        scan_result = scanner.scan(text)
        findings = scan_result.findings

        # Future: in Part C, inject quasi/medical findings here when flags are on

        # Policy
        profile_obj = registry.get_profile(profile)
        dest_trust = registry.get_destination_trust(destination)
        policy_result = PolicyEvaluator.evaluate(
            findings=findings,
            source="prompt",
            destination_trust=dest_trust,
            profile=profile_obj,
        )

        # Sanitize
        sanitizer = Sanitizer(scanner=scanner, role_placeholders=self._flags.role_ph)
        if policy_result.decision == Decision.ALLOW:
            sanitized_text = text
        else:
            san_result = sanitizer.sanitize(
                text=text,
                findings=findings,
                policy_result=policy_result,
            )
            sanitized_text = san_result.sanitized_text

        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        return VeilGuardResult(
            decision=policy_result.decision.value,
            sanitized_text=sanitized_text,
            finding_count=len(findings),
            latency_ms=elapsed_ms,
        )

    def sanitize(self, text: str) -> str:
        return self.run(text).sanitized_text

    def is_flagged(self, text: str) -> bool:
        return self.run(text).decision != "allow"


class VeilGuardTypeBased(_VeilGuardBase):
    """VeilGuard with ALL Phase 5 intelligence flags OFF (Phase 3a baseline)."""

    def __init__(self) -> None:
        super().__init__(flags=FeatureFlags.all_off())


class VeilGuardFull(_VeilGuardBase):
    """VeilGuard with all intelligence flags ON.

    In Part B this is identical to VeilGuardTypeBased because the intelligence
    modules do not exist yet. In Part C the modules are loaded and activated.
    """

    def __init__(self) -> None:
        super().__init__(flags=FeatureFlags.all_on())
