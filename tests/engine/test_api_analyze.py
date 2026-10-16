"""Tests for POST /analyze and GET /policy/profiles API endpoints."""

from fastapi.testclient import TestClient
from veilguard_engine.security import ACTIVE_API_TOKEN
from veilguard_engine.server import app

client = TestClient(app)


def test_analyze_authenticated_success() -> None:
    resp = client.post(
        "/analyze",
        headers={"Authorization": f"Bearer {ACTIVE_API_TOKEN}"},
        json={
            "text": "Call Rahul Sharma at 9876543210 regarding project.",
            "source": "prompt",
            "destination": "127.0.0.1",
            "profile": "company",
        },
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["offset_unit"] == "utf16"
    assert data["decision"] in ["redact", "require_approval", "block", "allow"]
    assert "options" in data
    assert "summary" in data
    assert "applied_rules" in data
    assert "findings" in data
    assert len(data["notices"]) > 0
    assert "Detection is not exhaustive. Review the text before sending." in data["notices"]
    assert data["stats"]["profile"] == "company"


def test_analyze_missing_token_returns_401() -> None:
    resp = client.post("/analyze", json={"text": "Hello world"})
    assert resp.status_code == 401
    assert "detail" in resp.json()


def test_policy_profiles_missing_token_returns_401() -> None:
    resp = client.get("/policy/profiles")
    assert resp.status_code == 401


def test_policy_profiles_authenticated_success() -> None:
    resp = client.get(
        "/policy/profiles",
        headers={"Authorization": f"Bearer {ACTIVE_API_TOKEN}"},
    )
    assert resp.status_code == 200
    profiles = resp.json()
    assert isinstance(profiles, list)
    names = [p["profile"] for p in profiles]
    assert "company" in names
    assert "personal" in names
    assert "finance" in names

    company = next(p for p in profiles if p["profile"] == "company")
    assert len(company["rules"]) > 0
    assert "rule_id" in company["rules"][0]
    assert "reason" in company["rules"][0]


def test_analyze_unknown_profile_returns_400_without_echoing_input() -> None:
    malicious_profile_name = "NON_EXISTENT_PROFILE_12345_SECRET_TOKEN"
    resp = client.post(
        "/analyze",
        headers={"Authorization": f"Bearer {ACTIVE_API_TOKEN}"},
        json={
            "text": "Regular benign text",
            "profile": malicious_profile_name,
        },
    )
    assert resp.status_code == 400
    # Must NOT echo the input value in detail
    assert malicious_profile_name not in resp.text
    assert resp.json()["detail"] == "Invalid policy profile requested."


def test_analyze_host_and_origin_security_enforcement() -> None:
    # Foreign origin rejected with 403
    resp_origin = client.post(
        "/analyze",
        headers={
            "Authorization": f"Bearer {ACTIVE_API_TOKEN}",
            "Origin": "https://malicious-external-site.com",
        },
        json={"text": "Test"},
    )
    assert resp_origin.status_code == 403

    # chrome-extension:// origin accepted
    resp_ext = client.post(
        "/analyze",
        headers={
            "Authorization": f"Bearer {ACTIVE_API_TOKEN}",
            "Origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
        },
        json={"text": "Benign note."},
    )
    assert resp_ext.status_code == 200
