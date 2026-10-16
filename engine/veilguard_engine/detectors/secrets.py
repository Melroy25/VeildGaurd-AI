"""Secrets and credentials detector.

Detects high-risk authentication tokens, API keys, private keys, connection strings,
and generic credential assignments.

Strict invariant:
The detected finding span MUST cover the secret VALUE only, excluding key names or assignment delimiters.
Never log or output matched secret content.
"""

import math
import re
from typing import List, Optional, Tuple

from veilguard_engine.models import Category, Finding


def calculate_shannon_entropy(data: str) -> float:
    """Calculate the Shannon entropy of a string."""
    if not data:
        return 0.0
    entropy = 0.0
    length = len(data)
    counts: dict[str, int] = {}
    for char in data:
        counts[char] = counts.get(char, 0) + 1
    for count in counts.values():
        p = count / length
        entropy -= p * math.log2(p)
    return entropy


# ─────────────────────────────────────────────────────────────────────────────
# Well-Known Vendor Key Patterns
# ─────────────────────────────────────────────────────────────────────────────

# AWS Access Key ID (e.g. AKIA...)
AWS_ACCESS_KEY_REGEX = re.compile(r"\b((?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16})\b")

# GitHub Personal Access Token (classic, fine-grained, app tokens)
GITHUB_TOKEN_REGEX = re.compile(
    r"\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}|github_pat_[A-Za-z0-9_]{82})\b"
)

# Slack API Token
SLACK_TOKEN_REGEX = re.compile(
    r"\b(xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*)\b"
)

# Google API Key
GOOGLE_API_KEY_REGEX = re.compile(r"\b(AIza[0-9A-Za-z\-_]{35})\b")

# Stripe-style API Secret Key
STRIPE_KEY_REGEX = re.compile(r"\b([rs]k_(?:live|test)_[0-9a-zA-Z]{24,99})\b")

# JSON Web Token (JWT)
JWT_REGEX = re.compile(
    r"\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b"
)

# PEM Private Key Blocks
PRIVATE_KEY_REGEX = re.compile(
    r"(-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----)"
)

# Database / Service Connection Strings with credentials: scheme://user:pass@host
CONNECTION_STRING_REGEX = re.compile(
    r"\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp|mssql)://[^\s:@]+:([^\s:]+)@([a-zA-Z0-9.-]+(?::\d+)?(?:/[^\s]*)?)",
    re.IGNORECASE,
)

# ─────────────────────────────────────────────────────────────────────────────
# Generic Credential Assignment Patterns
# Targets: key = "value", key: "value", "api_key": "value"
# Captures: Group 1 = Key Name, Group 2 = Secret Value
# ─────────────────────────────────────────────────────────────────────────────

GENERIC_ASSIGNMENT_REGEX = re.compile(
    r"""
    \b(password|passwd|secret|token|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)  # Key name
    \s*[:=]\s*                                                                                        # Delimiter
    ["']?([A-Za-z0-9_\-.~!@#$%^&*+=]{8,128})["']?                                                     # Value
    """,
    re.IGNORECASE | re.VERBOSE,
)


class SecretsDetector:
    """Detects secrets and credentials with exact secret-value span extraction."""

    name: str = "secrets_detector"

    def detect(self, text: str) -> List[Finding]:
        findings: List[Finding] = []
        if not text:
            return findings

        # Track spans to prevent duplicate overlapping findings for the same secret
        claimed_spans: set[tuple[int, int]] = set()

        def _add_finding(
            span: tuple[int, int],
            entity_type: str,
            rule_id: str,
            reason: str,
            score: float = 0.95,
        ):
            # Check overlap with existing claimed secret spans
            if any(s <= span[0] and span[1] <= e for s, e in claimed_spans):
                return
            findings.append(
                Finding(
                    id=f"secret_{span[0]}",
                    category=Category.SECRET,
                    entity_type=entity_type,
                    start=span[0],
                    end=span[1],
                    score=score,
                    detector=self.name,
                    rule_id=rule_id,
                    validated=True,
                    reason=reason,
                    also_detected_as=[],
                )
            )
            claimed_spans.add(span)

        # 1. Private Key Blocks
        for match in PRIVATE_KEY_REGEX.finditer(text):
            _add_finding(
                (match.start(1), match.end(1)),
                "PRIVATE_KEY",
                "SECRET.private_key_block.v1",
                "Identified unencrypted private key block header and payload.",
                score=0.99,
            )

        # 2. AWS Access Key IDs
        for match in AWS_ACCESS_KEY_REGEX.finditer(text):
            _add_finding(
                (match.start(1), match.end(1)),
                "AWS_ACCESS_KEY",
                "SECRET.aws_access_key.v1",
                "Identified AWS Access Key ID token format.",
                score=0.98,
            )

        # 3. GitHub Tokens
        for match in GITHUB_TOKEN_REGEX.finditer(text):
            _add_finding(
                (match.start(1), match.end(1)),
                "GITHUB_TOKEN",
                "SECRET.github_token.v1",
                "Identified GitHub authentication token format.",
                score=0.98,
            )

        # 4. Slack Tokens
        for match in SLACK_TOKEN_REGEX.finditer(text):
            _add_finding(
                (match.start(1), match.end(1)),
                "SLACK_TOKEN",
                "SECRET.slack_token.v1",
                "Identified Slack workspace API token format.",
                score=0.98,
            )

        # 5. Google API Keys
        for match in GOOGLE_API_KEY_REGEX.finditer(text):
            _add_finding(
                (match.start(1), match.end(1)),
                "GOOGLE_API_KEY",
                "SECRET.google_api_key.v1",
                "Identified Google cloud API key format.",
                score=0.98,
            )

        # 6. Stripe Keys
        for match in STRIPE_KEY_REGEX.finditer(text):
            _add_finding(
                (match.start(1), match.end(1)),
                "STRIPE_KEY",
                "SECRET.stripe_key.v1",
                "Identified Stripe payment API key format.",
                score=0.98,
            )

        # 7. JWT Tokens
        for match in JWT_REGEX.finditer(text):
            _add_finding(
                (match.start(1), match.end(1)),
                "JWT_TOKEN",
                "SECRET.jwt_token.v1",
                "Identified signed JSON Web Token (JWT) structure.",
                score=0.95,
            )

        # 8. Connection Strings (extract password value)
        for match in CONNECTION_STRING_REGEX.finditer(text):
            # match.group(1) is the password span inside scheme://user:pass@host
            _add_finding(
                (match.start(1), match.end(1)),
                "CONNECTION_STRING",
                "SECRET.connection_string_password.v1",
                "Identified embedded database credential password in URI.",
                score=0.92,
            )

        # 9. Generic Key Assignments (password = "...", api_key = "...")
        for match in GENERIC_ASSIGNMENT_REGEX.finditer(text):
            # match.group(1) = key, match.group(2) = value
            val_start = match.start(2)
            val_end = match.end(2)
            val_text = match.group(2)

            # Ignore common false positives (e.g. placeholder words like "password", "none", "null")
            if val_text.lower() in {"password", "none", "null", "undefined", "true", "false", "your_password"}:
                continue

            # Check entropy or minimum complexity
            entropy = calculate_shannon_entropy(val_text)
            # Normal prose English has entropy ~2.5-3.5; random keys have entropy > 3.0
            if len(val_text) >= 8 and (entropy >= 2.5 or any(c.isdigit() for c in val_text)):
                _add_finding(
                    (val_start, val_end),
                    "GENERIC_SECRET",
                    "SECRET.generic_assignment.v1",
                    "Identified credential value assigned to sensitive key name.",
                    score=0.88,
                )

        return findings
