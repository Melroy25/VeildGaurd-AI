"""Verification of the canonical project example prompt through POST /analyze."""

from fastapi.testclient import TestClient
from veilguard_engine.security import ACTIVE_API_TOKEN
from veilguard_engine.server import app

client = TestClient(app)


def test_canonical_example_prompt_analyze() -> None:
    prompt = (
        "Analyze customer Rahul Sharma's account, phone number 9876543210, "
        "and transaction history. Identify spending patterns."
    )

    resp = client.post(
        "/analyze",
        headers={"Authorization": f"Bearer {ACTIVE_API_TOKEN}"},
        json={
            "text": prompt,
            "source": "prompt",
            "destination": "127.0.0.1",
            "profile": "company",
        },
    )

    assert resp.status_code == 200
    data = resp.json()

    assert data["offset_unit"] == "utf16"
    assert data["decision"] == "redact"
    assert data["sanitization"] is not None

    sanitized = data["sanitization"]["sanitized_text"]
    # 9876543210 must be sanitized
    assert "9876543210" not in sanitized
    assert "[PHONE_1]" in sanitized

    # With span normalization and role placeholders, the trailing 's is preserved:
    assert ("[CUSTOMER_1]'s account" in sanitized) or ("[PERSON_1]'s account" in sanitized)


    # Verification must report zero residuals
    assert data["sanitization"]["verification"]["residual_findings"] == 0
