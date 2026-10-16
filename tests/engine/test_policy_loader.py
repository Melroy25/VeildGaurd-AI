"""Tests for policy loading and fail-closed schema validation."""

import pytest
from pathlib import Path
from veilguard_engine.policy.loader import PolicyRegistry
from veilguard_engine.policy.models import DestinationTrust


def test_valid_profiles_load_successfully() -> None:
    registry = PolicyRegistry()
    profiles = registry.list_profiles()
    profile_names = [p.profile for p in profiles]

    assert "company" in profile_names
    assert "personal" in profile_names
    assert "finance" in profile_names

    company = registry.get_profile("company")
    assert company is not None
    assert len(company.rules) > 0


def test_destination_trust_resolution() -> None:
    registry = PolicyRegistry()

    assert registry.get_destination_trust("127.0.0.1") == DestinationTrust.STANDARD
    assert registry.get_destination_trust("127.0.0.1:4310") == DestinationTrust.STANDARD
    assert registry.get_destination_trust("localhost") == DestinationTrust.STANDARD
    assert registry.get_destination_trust("untrusted-ai.example.com") == DestinationTrust.UNTRUSTED
    # Unknown destination falls back to standard
    assert registry.get_destination_trust("unknown-destination.xyz") == DestinationTrust.STANDARD


def test_fail_closed_on_unknown_field(tmp_path: Path) -> None:
    # Any unknown field must trigger ValidationError due to extra="forbid"
    bad_policy = tmp_path / "bad.yaml"
    bad_policy.write_text(
        """
version: 1
profile: bad_profile
description: "Testing unknown field"
unknown_field_not_allowed: true
rules: []
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Failed to validate policy file"):
        PolicyRegistry(policies_dir=tmp_path)


def test_fail_closed_on_unknown_decision(tmp_path: Path) -> None:
    bad_policy = tmp_path / "company.yaml"
    bad_policy.write_text(
        """
version: 1
profile: company
description: "Testing invalid decision"
rules:
  - id: RULE_1
    then:
      decision: invalid_decision_value
      action: remove
    reason: "test"
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Failed to validate policy file"):
        PolicyRegistry(policies_dir=tmp_path)


def test_fail_closed_on_unknown_action(tmp_path: Path) -> None:
    bad_policy = tmp_path / "company.yaml"
    bad_policy.write_text(
        """
version: 1
profile: company
description: "Testing invalid action"
rules:
  - id: RULE_1
    then:
      decision: block
      action: invalid_action_value
    reason: "test"
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Failed to validate policy file"):
        PolicyRegistry(policies_dir=tmp_path)


def test_fail_closed_on_missing_reason(tmp_path: Path) -> None:
    bad_policy = tmp_path / "company.yaml"
    bad_policy.write_text(
        """
version: 1
profile: company
description: "Testing missing reason"
rules:
  - id: RULE_1
    then:
      decision: block
      action: remove
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Failed to validate policy file"):
        PolicyRegistry(policies_dir=tmp_path)


def test_fail_closed_on_missing_default_profile(tmp_path: Path) -> None:
    # Directory with valid profile, but missing 'company' profile
    valid_other_policy = tmp_path / "personal.yaml"
    valid_other_policy.write_text(
        """
version: 1
profile: personal
description: "Personal profile only"
rules: []
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="Required default profile 'company' not found"):
        PolicyRegistry(policies_dir=tmp_path)
