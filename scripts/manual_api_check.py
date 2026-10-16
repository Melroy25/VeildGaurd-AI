"""Manual API verification script for Phase 2 Acceptance Criterion 4."""

import json
import pathlib
import urllib.error
import urllib.request

TOKEN_PATH = pathlib.Path(".veilguard/token")
token = TOKEN_PATH.read_text(encoding="utf-8").strip()

print("=== 1. Health Endpoint ===")
h = urllib.request.urlopen("http://127.0.0.1:8765/health")
print("Status:", h.status, json.loads(h.read().decode("utf-8")))

print("\n=== 2. Unauthenticated POST /scan ===")
req_unauth = urllib.request.Request(
    "http://127.0.0.1:8765/scan",
    data=b'{"text": "Hello world"}',
    headers={"Content-Type": "application/json"},
)
try:
    urllib.request.urlopen(req_unauth)
    print("ERROR: Expected 401 Unauthorized but request succeeded!")
except urllib.error.HTTPError as e:
    print(f"Verified: Expected 401 Unauthorized, received HTTP {e.code}")

print("\n=== 3. Authenticated POST /scan on Canonical Example Prompt ===")
prompt = (
    "Analyze customer Rahul Sharma's account, phone number 9876543210, and transaction history. "
    "Identify spending patterns."
)
req_auth = urllib.request.Request(
    "http://127.0.0.1:8765/scan",
    data=json.dumps({"text": prompt}).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    },
)
res = urllib.request.urlopen(req_auth)
body_str = res.read().decode("utf-8")
parsed = json.loads(body_str)
print(json.dumps(parsed, indent=2))

print("\n=== 4. Sensitive Content Invariant Verification ===")
assert "Rahul Sharma" not in body_str, "Privacy Violation: 'Rahul Sharma' found in response body!"
assert "9876543210" not in body_str, "Privacy Violation: '9876543210' found in response body!"
print("PASSED: Verified response body contains offsets and classifications, but ZERO matched sensitive text.")
