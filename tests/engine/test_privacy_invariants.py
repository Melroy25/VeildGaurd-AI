"""Privacy property invariant tests (Rule 7).

Proves that raw sensitive substrings never appear in:
1. API response bodies.
2. Engine console/file logging records (even at DEBUG level).
"""

import logging
import pytest
from fastapi.testclient import TestClient

from veilguard_engine.security import ACTIVE_API_TOKEN
from veilguard_engine.server import app


def test_zero_raw_content_in_response_and_logs(caplog):
    """Verify matched sensitive values (name & phone number) are NEVER present in response JSON or logs."""
    client = TestClient(app, base_url="http://127.0.0.1:8765")
    synthetic_name = "Vikramaditya Sengupta"
    synthetic_phone = "9876543210"
    prompt = f"Customer name is {synthetic_name} and telephone number is {synthetic_phone}."

    with caplog.at_level(logging.DEBUG):
        # Attach filter to caplog's dynamically added handler
        from veilguard_engine.security import configure_privacy_logging
        configure_privacy_logging()

        headers = {"Authorization": f"Bearer {ACTIVE_API_TOKEN}"}
        response = client.post("/scan", json={"text": prompt}, headers=headers)

    assert response.status_code == 200

    # 1. Assert response JSON text does NOT contain sensitive substrings
    raw_response_text = response.text
    assert synthetic_name not in raw_response_text, (
        f"Privacy Invariant Violation: raw name '{synthetic_name}' found in API response body!"
    )
    assert synthetic_phone not in raw_response_text, (
        f"Privacy Invariant Violation: raw phone '{synthetic_phone}' found in API response body!"
    )

    # 2. Assert findings DO contain the offsets and metadata
    data = response.json()
    assert len(data["findings"]) >= 1

    # 3. Assert caplog debug logs do NOT contain sensitive substrings
    all_logs = " ".join([rec.getMessage() for rec in caplog.records])
    assert synthetic_name not in all_logs, (
        f"Privacy Invariant Violation: raw name '{synthetic_name}' found in server log output!"
    )
    assert synthetic_phone not in all_logs, (
        f"Privacy Invariant Violation: raw phone '{synthetic_phone}' found in server log output!"
    )
