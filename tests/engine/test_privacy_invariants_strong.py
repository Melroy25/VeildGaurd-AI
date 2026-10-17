"""Strong privacy invariant verification for VeilGuard Engine (Rule 7).

Asserts that:
1. No original sensitive value appears anywhere in the response findings, replacements, or metadata.
2. Under DEBUG logging level, no submitted prompt text or sensitive values appear in application logs.
"""

import logging
from fastapi.testclient import TestClient
import pytest

from veilguard_engine.security import ACTIVE_API_TOKEN, configure_privacy_logging
from veilguard_engine.server import app


def test_strong_privacy_invariants_analyze_response_and_logs(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # 1. Attach privacy filter to caplog handler
    configure_privacy_logging()

    client = TestClient(app)

    # Prompt with synthetic name, phone, and AWS key
    secret_key = "AKIAIOSFODNN7EXAMPLE"
    phone_number = "9876543210"
    person_name = "Rahul Sharma"

    prompt_text = (
        f"Critical update: assign engineer {person_name} with phone {phone_number} "
        f"and access key {secret_key} to cloud deployment immediately."
    )

    with caplog.at_level(logging.DEBUG):
        configure_privacy_logging()

        resp = client.post(
            "/analyze",
            headers={"Authorization": f"Bearer {ACTIVE_API_TOKEN}"},
            json={
                "text": prompt_text,
                "source": "prompt",
                "destination": "127.0.0.1",
                "profile": "company",
            },
        )

    assert resp.status_code == 200
    data = resp.json()

    # Part A: Response assertions
    # 1. Findings must contain no sensitive text in reason, rule_id, detector, etc.
    for finding in data["findings"]:
        assert secret_key not in finding["reason"]
        assert phone_number not in finding["reason"]
        assert person_name not in finding["reason"]

    # 2. Replacements must contain no sensitive values (strictly offsets, actions, placeholders)
    if data["sanitization"]:
        for repl in data["sanitization"]["replacements"]:
            # replacement must not carry original text
            repl_str = str(repl)
            assert secret_key not in repl_str
            assert phone_number not in repl_str
            assert person_name not in repl_str

        # Sanitized text must not contain the sensitive raw values
        assert secret_key not in data["sanitization"]["sanitized_text"]
        assert phone_number not in data["sanitization"]["sanitized_text"]
        assert person_name not in data["sanitization"]["sanitized_text"]

    # 3. Context block must contain zero sensitive text or raw prompt
    assert "context" in data
    assert data["context"] is not None
    import json
    context_str = json.dumps(data["context"])
    assert secret_key not in context_str, "Secret leaked in context block"
    assert phone_number not in context_str, "Phone leaked in context block"
    assert person_name not in context_str, "Name leaked in context block"
    assert prompt_text not in context_str, "Full prompt leaked in context block"

    # Part B: Logging assertions (Zero sensitive text or full prompt in logs at DEBUG level)
    for record in caplog.records:
        msg = record.getMessage()
        assert secret_key not in msg, f"Secret leaked in log record: {msg}"
        assert phone_number not in msg, f"Phone leaked in log record: {msg}"
        assert person_name not in msg, f"Name leaked in log record: {msg}"
        assert prompt_text not in msg, f"Full prompt leaked in log record: {msg}"
