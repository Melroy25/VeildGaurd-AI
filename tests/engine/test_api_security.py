"""API security, authentication, and request hygiene tests."""

import pytest
from fastapi.testclient import TestClient

from veilguard_engine.security import ACTIVE_API_TOKEN
from veilguard_engine.server import app


@pytest.fixture
def client():
    # Use TestClient with base_url matching allowed host
    return TestClient(app, base_url="http://127.0.0.1:8765")


def test_scan_with_valid_token_succeeds(client):
    headers = {"Authorization": f"Bearer {ACTIVE_API_TOKEN}"}
    response = client.post(
        "/scan",
        json={"text": "Review customer Rahul Sharma, mobile 9876543210."},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "findings" in data
    assert "stats" in data


def test_scan_missing_token_returns_401(client):
    response = client.post(
        "/scan",
        json={"text": "Unauthenticated test prompt."},
    )
    assert response.status_code == 401
    assert "detail" in response.json()


def test_scan_invalid_token_returns_401(client):
    headers = {"Authorization": "Bearer deliberately-wrong-token-value"}
    response = client.post(
        "/scan",
        json={"text": "Unauthenticated test prompt."},
        headers=headers,
    )
    assert response.status_code == 401


def test_host_header_rebinding_rejected():
    """Verify TrustedHostMiddleware rejects requests with foreign Host headers (e.g. DNS rebinding)."""
    # Create client that sends an untrusted Host header
    untrusted_client = TestClient(app, base_url="http://evil-rebinding-domain.com")
    headers = {"Authorization": f"Bearer {ACTIVE_API_TOKEN}"}
    response = untrusted_client.post(
        "/scan",
        json={"text": "DNS rebinding attack test."},
        headers=headers,
    )
    assert response.status_code in (400, 403)


def test_foreign_origin_rejected_with_403(client):
    """Verify OriginCheckMiddleware rejects web origins that are not chrome-extension://."""
    headers = {
        "Authorization": f"Bearer {ACTIVE_API_TOKEN}",
        "Origin": "https://malicious-website.example.com",
    }
    response = client.post(
        "/scan",
        json={"text": "Cross-origin request test."},
        headers=headers,
    )
    assert response.status_code == 403


def test_extension_origin_accepted(client):
    """Verify chrome-extension:// Origin header is accepted."""
    headers = {
        "Authorization": f"Bearer {ACTIVE_API_TOKEN}",
        "Origin": "chrome-extension://abcdefghijklmnopqrstuvwxyz123456",
    }
    response = client.post(
        "/scan",
        json={"text": "Safe extension call."},
        headers=headers,
    )
    assert response.status_code == 200


def test_options_preflight_receives_no_cors_headers(client):
    """Verify engine returns no Access-Control-Allow-Origin for unauthorized web origins."""
    headers = {
        "Origin": "https://evil.example.com",
        "Access-Control-Request-Method": "POST",
    }
    response = client.options("/scan", headers=headers)
    assert "access-control-allow-origin" not in response.headers


def test_options_preflight_for_extension_origin_receives_cors_headers(client):
    """Verify chrome-extension:// preflight receives valid CORS headers."""
    headers = {
        "Origin": "chrome-extension://abcdefghijklmnopqrstuvwxyz123456",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    }
    response = client.options("/analyze", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "chrome-extension://abcdefghijklmnopqrstuvwxyz123456"
    assert "authorization" in response.headers.get("access-control-allow-headers", "").lower()



def test_oversized_text_rejected_with_422(client):
    """Verify texts exceeding max_length (200,000) are rejected."""
    oversized = "A" * 200_001
    headers = {"Authorization": f"Bearer {ACTIVE_API_TOKEN}"}
    response = client.post(
        "/scan",
        json={"text": oversized},
        headers=headers,
    )
    assert response.status_code == 422


def test_sanitized_validation_handler_does_not_echo_input(client):
    """Verify malformed JSON requests return generic error without echoing the submitted text."""
    sensitive_junk = "EXTREMELY_SENSITIVE_SECRET_DATA_THAT_MUST_NEVER_BE_ECHOED"
    # Sending invalid type (integer instead of string) for 'text' field
    headers = {"Authorization": f"Bearer {ACTIVE_API_TOKEN}"}
    response = client.post(
        "/scan",
        json={"text": 12345, "invalid_field": sensitive_junk},
        headers=headers,
    )
    assert response.status_code == 422
    response_text = response.text
    # The sensitive string from the payload MUST NOT be echoed in the error response body
    assert sensitive_junk not in response_text


def test_auth_pair_with_extension_origin_succeeds(client):
    """Verify /auth/pair returns active token when called from chrome-extension origin."""
    headers = {"Origin": "chrome-extension://abcdefghijklmnopqrstuvwxyz123456"}
    response = client.post("/auth/pair", json={}, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["token"] == ACTIVE_API_TOKEN
    assert data["status"] == "paired"


def test_auth_pair_with_malicious_origin_is_rejected(client):
    """Verify /auth/pair rejects foreign web origins."""
    headers = {"Origin": "https://evil-site.com"}
    response = client.post("/auth/pair", json={}, headers=headers)
    assert response.status_code == 403

