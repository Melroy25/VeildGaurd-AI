"""Mathematical and structural validators for Indian identifiers.

Includes:
1. Verhoeff Checksum (for Aadhaar number validation and generation).
2. GSTIN Mod-36 Checksum (official GST Council / CBIC specification).
3. PAN Structure and entity-type validation.
"""

import re
from typing import Optional

# ─────────────────────────────────────────────────────────────────────────────
# 1. Verhoeff Checksum Algorithm
# ─────────────────────────────────────────────────────────────────────────────

VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]

VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]


def validate_verhoeff(num_str: str) -> bool:
    """Validate a numeric string using the Verhoeff checksum algorithm.

    Example:
        validate_verhoeff("2363") -> True
        validate_verhoeff("2364") -> False
    """
    clean = re.sub(r"[\s-]", "", num_str)
    if not clean.isdigit() or len(clean) < 2:
        return False

    c = 0
    for i, item in enumerate(reversed(clean)):
        c = VERHOEFF_D[c][VERHOEFF_P[i % 8][int(item)]]

    return c == 0


def generate_verhoeff_check_digit(num_str: str) -> int:
    """Generate the Verhoeff check digit for a numeric string.

    Example:
        generate_verhoeff_check_digit("236") -> 3
    """
    clean = re.sub(r"[\s-]", "", num_str)
    if not clean.isdigit() or len(clean) == 0:
        raise ValueError("Input must be a non-empty numeric string")

    c = 0
    for i, item in enumerate(reversed(clean)):
        c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][int(item)]]

    return VERHOEFF_INV[c]


# ─────────────────────────────────────────────────────────────────────────────
# 2. PAN (Permanent Account Number) Structure Validation
# ─────────────────────────────────────────────────────────────────────────────

# Valid 4th character entity status codes per Income Tax Department
PAN_STATUS_CODES = {"C", "P", "H", "F", "A", "T", "B", "L", "J", "G"}

PAN_REGEX = re.compile(r"^[A-Z]{3}[CPHFATBLJG][A-Z][0-9]{4}[A-Z]$")


def validate_pan(pan: str) -> bool:
    """Validate Indian PAN format and holder status code.

    Structure:
    - Chars 1-3: Alphabetic series (A-Z)
    - Char 4: Status code (C, P, H, F, A, T, B, L, J, G)
    - Char 5: Alphabetic character (usually first character of surname/name)
    - Chars 6-9: Sequential digits (0001-9999)
    - Char 10: Alphabetic check digit
    """
    if not pan or len(pan) != 10:
        return False
    return bool(PAN_REGEX.match(pan.upper()))


# ─────────────────────────────────────────────────────────────────────────────
# 3. GSTIN (Goods and Services Tax Identification Number) Validation
# ─────────────────────────────────────────────────────────────────────────────

GST_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
GST_CHAR_MAP = {c: i for i, c in enumerate(GST_ALPHABET)}

# Valid 2-digit Indian State / UT codes (01-38, 97, 99)
VALID_STATE_CODES = {
    f"{i:02d}"
    for i in list(range(1, 39)) + [97, 99]
}


def compute_gstin_check_digit(first14: str) -> str:
    """Calculate the 15th character checksum for a 14-character GSTIN prefix.

    Algorithm: Official GST Council Mod-36 checksum.
    Alternating factor: 1 for odd positions (index 0, 2, 4...), 2 for even (index 1, 3, 5...).
    """
    first14 = first14.upper()
    if len(first14) != 14:
        raise ValueError("First 14 characters of GSTIN required")

    total_sum = 0
    for idx, char in enumerate(first14):
        val = GST_CHAR_MAP.get(char)
        if val is None:
            raise ValueError(f"Invalid character in GSTIN prefix: {char}")

        factor = 1 if (idx % 2 == 0) else 2
        product = val * factor
        quotient = product // 36
        remainder = product % 36
        total_sum += quotient + remainder

    check_val = (36 - (total_sum % 36)) % 36
    return GST_ALPHABET[check_val]


def validate_gstin(gstin: str) -> bool:
    """Validate 15-character GSTIN format, state code, PAN structure, and Mod-36 checksum."""
    if not gstin or len(gstin) != 15:
        return False

    gstin = gstin.upper()

    # Check 1: State code
    state_code = gstin[:2]
    if state_code not in VALID_STATE_CODES:
        return False

    # Check 2: Embedded PAN (chars 3-12)
    pan_part = gstin[2:12]
    if not validate_pan(pan_part):
        return False

    # Check 3: 13th char is alphanumeric, 14th char is strictly 'Z'
    if not gstin[12].isalnum() or gstin[13] != "Z":
        return False

    # Check 4: Mod-36 checksum digit
    expected_check = compute_gstin_check_digit(gstin[:14])
    return gstin[14] == expected_check
