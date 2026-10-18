"""Policy loader and registry for VeilGuard AI Engine.

Fail-closed invariant:
Any invalid YAML, unknown field, invalid decision/action, or missing default profile
raises an exception, causing the engine to fail to start rather than allowing unprotected traffic.
"""

from pathlib import Path
import sys
from typing import Dict, List, Optional
import yaml

from veilguard_engine.policy.models import (
    DestinationTrust,
    DestinationsFile,
    PolicyProfile,
)


class PolicyRegistry:
    """Loads, validates, and stores policy profiles and destination trust configurations."""

    def __init__(self, policies_dir: Optional[Path] = None):
        if policies_dir is None:
            # Check sys._MEIPASS first if in PyInstaller bundle, then relative to repo root
            if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
                candidate = Path(sys._MEIPASS) / "policies"
                if candidate.exists():
                    self.policies_dir = candidate
                else:
                    self.policies_dir = Path(__file__).resolve().parent.parent.parent.parent / "policies"
            else:
                self.policies_dir = Path(__file__).resolve().parent.parent.parent.parent / "policies"
        else:
            self.policies_dir = Path(policies_dir)

        self.profiles: Dict[str, PolicyProfile] = {}
        self.destinations: Dict[str, DestinationTrust] = {}
        self.default_trust: DestinationTrust = DestinationTrust.STANDARD

        self.load_all()

    def load_all(self) -> None:
        """Load destinations.yaml and all policy profile YAML files."""
        if not self.policies_dir.exists() or not self.policies_dir.is_dir():
            raise FileNotFoundError(
                f"Policy directory does not exist or is not a directory: {self.policies_dir}"
            )

        # 1. Load destinations.yaml
        dest_file = self.policies_dir / "destinations.yaml"
        if dest_file.exists():
            try:
                with open(dest_file, "r", encoding="utf-8") as f:
                    raw_dest = yaml.safe_load(f) or {}
                parsed_dest = DestinationsFile.model_validate(raw_dest)
                self.default_trust = parsed_dest.default_trust
                self.destinations = parsed_dest.destinations
            except Exception as e:
                raise ValueError(f"Failed to load destinations file '{dest_file}': {e}") from e

        # 2. Load policy profile files
        for yml_path in sorted(self.policies_dir.glob("*.yaml")) + sorted(
            self.policies_dir.glob("*.yml")
        ):
            if yml_path.name in ("destinations.yaml", "destinations.yml", "watchlist.example.yaml", "watchlist.yaml"):
                continue

            try:
                with open(yml_path, "r", encoding="utf-8") as f:
                    raw_data = yaml.safe_load(f)

                if not isinstance(raw_data, dict) or "profile" not in raw_data:
                    # Skip non-profile yaml files if any
                    continue

                profile_obj = PolicyProfile.model_validate(raw_data)
                self.profiles[profile_obj.profile] = profile_obj
            except Exception as e:
                raise ValueError(f"Failed to validate policy file '{yml_path}': {e}") from e

        # 3. Fail-closed: default profile 'company' must exist
        if "company" not in self.profiles:
            raise ValueError(
                f"Required default profile 'company' not found in policies directory '{self.policies_dir}'"
            )

    def get_profile(self, name: str) -> Optional[PolicyProfile]:
        """Return profile by name, or None if not found."""
        return self.profiles.get(name)

    def list_profiles(self) -> List[PolicyProfile]:
        """Return list of all registered policy profiles."""
        return list(self.profiles.values())

    def get_destination_trust(self, destination: str) -> DestinationTrust:
        """Resolve trust level for a destination hostname, defaulting to default_trust."""
        clean_dest = destination.strip().lower()
        # Strip port if present (e.g. 127.0.0.1:4310 -> 127.0.0.1)
        if ":" in clean_dest and not clean_dest.startswith("["):
            clean_dest = clean_dest.split(":")[0]
        return self.destinations.get(clean_dest, self.default_trust)
