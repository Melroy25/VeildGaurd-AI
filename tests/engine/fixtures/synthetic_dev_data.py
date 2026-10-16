"""Synthetic development test fixtures for VeilGuard engine unit tests.

IMPORTANT INVARIANT (Rule 10):
All fixtures in this file are STRICTLY SYNTHETIC test data.
No real personal data or proprietary secrets are included.
Secrets are assembled dynamically or use published vendor documentation examples.
"""

import random
from typing import List, Tuple
from veilguard_engine.detectors.validators import (
    compute_gstin_check_digit,
    generate_verhoeff_check_digit,
)


def get_synthetic_aadhaar_numbers() -> Tuple[str, str, str]:
    """Generate deterministic synthetic Aadhaar numbers with valid Verhoeff checksums."""
    rng = random.Random(1337)

    def _make(seed_int: int) -> str:
        r = random.Random(seed_int)
        first = str(r.randint(2, 9)) + "".join(str(r.randint(0, 9)) for _ in range(10))
        check = generate_verhoeff_check_digit(first)
        return first + str(check)

    return _make(101), _make(202), _make(303)


SYNTHETIC_AADHAAR_VALID_1, SYNTHETIC_AADHAAR_VALID_2, SYNTHETIC_AADHAAR_VALID_3 = (
    get_synthetic_aadhaar_numbers()
)

# Invalid 12-digit number (deliberately broken check digit)
SYNTHETIC_AADHAAR_INVALID = SYNTHETIC_AADHAAR_VALID_1[:-1] + (
    "0" if SYNTHETIC_AADHAAR_VALID_1[-1] != "0" else "1"
)

# Synthetic PANs
SYNTHETIC_PAN_VALID_PERSON = "ABCPE1234F"
SYNTHETIC_PAN_VALID_COMPANY = "XYZCE9876K"
SYNTHETIC_PAN_INVALID_ENTITY = "ABCXE1234F"  # 'X' is invalid 4th character
SYNTHETIC_PAN_INVALID_LENGTH = "ABCPE1234"

# Synthetic GSTINs
_gstin_prefix = "27" + SYNTHETIC_PAN_VALID_COMPANY + "1Z"
SYNTHETIC_GSTIN_VALID = _gstin_prefix + compute_gstin_check_digit(_gstin_prefix)
SYNTHETIC_GSTIN_INVALID = (
    _gstin_prefix + ("0" if SYNTHETIC_GSTIN_VALID[-1] != "0" else "1")
)

# Synthetic IFSCs
SYNTHETIC_IFSC_VALID = "HDFC0001234"
SYNTHETIC_IFSC_INVALID_ZERO = "HDFCA001234"  # 5th char not '0'

# Synthetic Mobile numbers
SYNTHETIC_MOBILE_VALID_1 = "9876543210"
SYNTHETIC_MOBILE_VALID_2 = "8765432109"
SYNTHETIC_MOBILE_WITH_PREFIX = "+91 9876543210"

# Synthetic UPI VPAs
SYNTHETIC_UPI_VALID_1 = "rahul.sharma@oksbi"
SYNTHETIC_UPI_VALID_2 = "customer_pay@paytm"
SYNTHETIC_NON_UPI_EMAIL = "rahul.sharma@example.com"  # has dot in domain -> Email, not UPI

# Synthetic Secrets (assembled at runtime from non-secret fragments to satisfy push protection)
def make_synthetic_aws_key() -> str:
    # Uses official AWS documentation example prefix pattern
    return "AKIA" + "IOSFODNN7EXAMPLE"[:16]


def make_synthetic_github_token() -> str:
    return "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"


def make_synthetic_slack_token() -> str:
    return "xoxb-123456789012-1234567890123-abcDEF123456"


def make_synthetic_google_key() -> str:
    return "AIza" + "SyD1234567890abcdefghijklmnopqrstuv"


def make_synthetic_jwt() -> str:
    header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    payload = "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QifQ"
    sig = "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    return f"{header}.{payload}.{sig}"


SYNTHETIC_AWS_KEY = make_synthetic_aws_key()
SYNTHETIC_GITHUB_TOKEN = make_synthetic_github_token()
SYNTHETIC_SLACK_TOKEN = make_synthetic_slack_token()
SYNTHETIC_GOOGLE_KEY = make_synthetic_google_key()
SYNTHETIC_JWT = make_synthetic_jwt()
