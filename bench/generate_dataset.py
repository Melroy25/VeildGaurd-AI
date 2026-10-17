#!/usr/bin/env python3
"""bench/generate_dataset.py — VeilGuard AI synthetic benchmark dataset generator.

Generates bench/data/dev.jsonl, bench/data/test.jsonl, and bench/data/MANIFEST.json.

INTEGRITY RULES (per AGENTS.md and Phase 5 prompt):
- All synthetic data. No real personal data (Rule 10).
- Seeded deterministic RNG — same seed → same output.
- Template families are assigned wholly to one split (never split across dev/test).
- Handwritten items are split by deterministic hash of item id.
- Offsets are computed from text, never hand-counted.
- Run BEFORE writing any intelligence code.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import datetime
from pathlib import Path
from typing import Any, Optional

import yaml

# ─── Ensure project root on path ──────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BENCH_DATA = PROJECT_ROOT / "bench" / "data"
ENGINE_PATH = PROJECT_ROOT / "engine"
if str(ENGINE_PATH) not in sys.path:
    sys.path.insert(0, str(ENGINE_PATH))

from veilguard_engine.detectors.validators import (
    generate_verhoeff_check_digit,
    compute_gstin_check_digit,
    validate_pan,
)

# ─── Seed ─────────────────────────────────────────────────────────────────────
SEED = 42  # frozen — never change after dataset v1 commit


# ─── Seeded RNG ────────────────────────────────────────────────────────────────
import random as _random

_rng = _random.Random(SEED)


def _rng_fork(name: str) -> _random.Random:
    """Return a deterministic sub-RNG seeded from a name string."""
    seed = int(hashlib.sha256(name.encode()).hexdigest()[:8], 16) ^ SEED
    return _random.Random(seed)


# ─── Synthetic pools ───────────────────────────────────────────────────────────

INDIAN_NAMES_FIRST = [
    "Aarav", "Ananya", "Arjun", "Deepa", "Farhan", "Geeta", "Harish", "Isha",
    "Kabir", "Lakshmi", "Mihir", "Neha", "Omkar", "Priya", "Rahul", "Savita",
    "Tarun", "Usha", "Vijay", "Yamini", "Zara", "Bhavna", "Chirag", "Disha",
    "Ekta", "Gaurav", "Himanshu", "Ira", "Jayant", "Kamla", "Lokesh", "Megha",
    "Naveen", "Pooja", "Rajesh", "Shreya", "Tushar", "Vasudha", "Wasim", "Yashvi",
]

INDIAN_NAMES_LAST = [
    "Sharma", "Patel", "Nair", "Mehta", "Desai", "Pillai", "Joshi", "Gupta",
    "Singh", "Kumar", "Rao", "Reddy", "Menon", "Iyer", "Chaudhary", "Bose",
    "Das", "Mukherjee", "Kapoor", "Verma", "Malhotra", "Shah", "Choudhury",
    "Agarwal", "Tiwari", "Mishra", "Pandey", "Shukla", "Saxena", "Srivastava",
]

FICTIONAL_COMPANIES = [
    "Acme Technologies", "Globex Industries", "NovaTech Solutions", "Meridian Corp",
    "Brainwave Labs", "Zenith Industries", "LogiFirst", "Starfield Analytics",
    "Pinnacle Software", "Aurora Systems", "Vertex Consulting", "Cascade Digital",
    "HorizonTech", "Synapse Solutions", "Quantum Dynamics", "TechStar Ventures",
    "OmniCorp", "DataBridge Inc", "CloudForge", "NexaGroup",
]

INDIAN_CITIES = [
    "Mumbai", "Delhi", "Bengaluru", "Pune", "Hyderabad", "Chennai",
    "Kolkata", "Ahmedabad", "Jaipur", "Surat", "Noida", "Gurgaon",
]

ROLES = [
    "HR manager", "software engineer", "senior accountant", "product manager",
    "CFO", "CTO", "VP of Operations", "sales director", "warehouse supervisor",
    "data analyst", "marketing manager", "legal counsel", "financial analyst",
    "operations manager", "UX designer", "DevOps engineer",
]

SENSITIVE_EVENTS = [
    "maternity leave", "paternity leave", "medical leave", "termination",
    "resignation", "promotion", "lawsuit", "divorce", "surgery", "demotion",
]

MEDICAL_CONDITIONS = [
    "Type 2 diabetes", "hypertension", "depression", "anxiety", "ADHD",
    "schizophrenia", "cancer", "chemotherapy", "hypothyroidism", "asthma",
]

MEDICATIONS = [
    "metformin", "amlodipine", "atenolol", "lisinopril", "omeprazole",
    "paracetamol", "ibuprofen", "aspirin", "insulin", "levothyroxine",
]

SECRET_PREFIXES = [
    ("AWS_ACCESS_KEY", "AKIA", 16, "ABCDEFGHIJKLMNOP"),
    ("GITHUB_TOKEN", "ghp_", 36, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"),
    ("STRIPE_KEY", "sk_live_", 24, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"),
    ("GOOGLE_API_KEY", "AIza", 35, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij012345"),
    ("SLACK_TOKEN", "xoxb-", 0, None),  # handled specially
]

DOMAIN_POOL = [
    "acmecorp.example", "globex.example", "techstar.example",
    "fintech.example", "startup.example", "enterprise.example",
]


# ─── Synthetic data generators ────────────────────────────────────────────────

def _make_name(rng: _random.Random) -> str:
    return f"{rng.choice(INDIAN_NAMES_FIRST)} {rng.choice(INDIAN_NAMES_LAST)}"


def _make_email(name: str, rng: _random.Random) -> str:
    local = name.lower().replace(" ", ".").replace("'", "")
    domain = rng.choice(DOMAIN_POOL)
    return f"{local}@{domain}"


def _make_mobile(rng: _random.Random) -> str:
    # Indian mobile: starts 6-9, 10 digits
    start = rng.choice(["6", "7", "8", "9"])
    rest = "".join(str(rng.randint(0, 9)) for _ in range(9))
    return start + rest


def _make_aadhaar(rng: _random.Random, valid: bool = True) -> str:
    # First digit 2-9
    first = str(rng.randint(2, 9))
    middle = "".join(str(rng.randint(0, 9)) for _ in range(10))
    if valid:
        check = generate_verhoeff_check_digit(first + middle)
        return first + middle + str(check)
    else:
        check = generate_verhoeff_check_digit(first + middle)
        bad_check = (int(check) + 1) % 10
        return first + middle + str(bad_check)


def _make_pan(rng: _random.Random, valid: bool = True) -> str:
    import string
    if valid:
        series = "".join(rng.choices(string.ascii_uppercase, k=3))
        entity = rng.choice(list("CPHFATBLJG"))
        fifth = rng.choice(string.ascii_uppercase)
        digits = "".join(str(rng.randint(0, 9)) for _ in range(4))
        last = rng.choice(string.ascii_uppercase)
        return series + entity + fifth + digits + last
    else:
        series = "".join(rng.choices(string.ascii_uppercase, k=3))
        # X is invalid entity code
        fifth = rng.choice(string.ascii_uppercase)
        digits = "".join(str(rng.randint(0, 9)) for _ in range(4))
        last = rng.choice(string.ascii_uppercase)
        return series + "X" + fifth + digits + last


def _make_gstin(rng: _random.Random) -> str:
    pan = _make_pan(rng, valid=True)
    state = f"{rng.randint(1, 38):02d}"
    prefix = state + pan + "1Z"
    check = compute_gstin_check_digit(prefix)
    return prefix + check


def _make_credit_card(rng: _random.Random) -> str:
    # Luhn-valid Visa prefix 4 — test number pattern
    n = [4] + [rng.randint(0, 9) for _ in range(14)]
    # Luhn check digit
    total = 0
    for i, d in enumerate(reversed(n)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    check = (10 - (total % 10)) % 10
    digits = "".join(str(d) for d in n) + str(check)
    # Format as groups of 4
    return f"{digits[:4]} {digits[4:8]} {digits[8:12]} {digits[12:]}"


def _make_aws_key(rng: _random.Random) -> str:
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return "AKIA" + "".join(rng.choices(chars, k=16))


def _make_github_token(rng: _random.Random) -> str:
    import string
    chars = string.ascii_letters + string.digits
    return "ghp_" + "".join(rng.choices(chars, k=36))


def _make_stripe_key(rng: _random.Random) -> str:
    import string
    chars = string.ascii_letters + string.digits
    return "sk_live_" + "".join(rng.choices(chars, k=24))


def _make_slack_token(rng: _random.Random) -> str:
    ws = "".join(str(rng.randint(0, 9)) for _ in range(12))
    user = "".join(str(rng.randint(0, 9)) for _ in range(13))
    import string
    chars = string.ascii_letters + string.digits
    suffix = "".join(rng.choices(chars, k=12))
    return f"xoxb-{ws}-{user}-{suffix}"


def _make_upi(name: str, rng: _random.Random) -> str:
    handles = ["oksbi", "okaxis", "paytm", "ybl", "upi"]
    local = name.lower().replace(" ", ".").replace("'", "")
    return f"{local}@{rng.choice(handles)}"


def _make_ifsc(rng: _random.Random) -> str:
    banks = ["HDFC", "ICIC", "SBIN", "AXIS", "KOTAK", "UNBN", "PUNB"]
    bank = rng.choice(banks)
    branch = f"{rng.randint(1000, 9999)}"
    return f"{bank}0{branch}"


def _make_bank_account(rng: _random.Random) -> str:
    return "".join(str(rng.randint(0, 9)) for _ in range(rng.choice([11, 12, 14])))


# ─── Markup parser (computes Python code-point offsets) ───────────────────────

MARKUP_RE = re.compile(r"\[\[([A-Z0-9_]+)\|([^\]]+)\]\]")


def parse_markup(annotated: str) -> tuple[str, list[dict[str, Any]]]:
    """Convert [[GROUP|value]] markup into (clean_text, entity_list)."""
    clean_parts: list[str] = []
    entities: list[dict[str, Any]] = []
    offset = 0
    last = 0

    for m in MARKUP_RE.finditer(annotated):
        preceding = annotated[last: m.start()]
        clean_parts.append(preceding)
        offset += len(preceding)

        group = m.group(1)
        value = m.group(2)
        start = offset
        end = offset + len(value)
        entities.append({"start": start, "end": end, "group": group})
        clean_parts.append(value)
        offset += len(value)
        last = m.end()

    clean_parts.append(annotated[last:])
    return "".join(clean_parts), entities


# ─── Template definitions ──────────────────────────────────────────────────────
# Each template is a function that returns (annotated_text, metadata_dict).
# metadata_dict keys: category, task_type, expected_decision, required_spans,
#                     combo_risk, notes

def _required_span(text: str, value: str) -> Optional[dict[str, int]]:
    """Find start/end of value in text (Python code points)."""
    idx = text.find(value)
    if idx == -1:
        return None
    return {"start": idx, "end": idx + len(value)}


def _req_spans(text: str, values: list[str]) -> list[dict[str, int]]:
    spans = []
    for v in values:
        s = _required_span(text, v)
        if s:
            spans.append(s)
    return spans


# ─── Template families ────────────────────────────────────────────────────────
# Family key → list of (annotated_text, meta) generator functions

def _tmpl_direct_pii_name_phone_email(rng: _random.Random) -> tuple[str, dict]:
    name = _make_name(rng)
    phone = _make_mobile(rng)
    email = _make_email(name, rng)
    annotated = (
        f"Please update the contact for [[PERSON|{name}]] to mobile "
        f"[[PHONE|{phone}]] and email [[EMAIL|{email}]]."
    )
    return annotated, {
        "category": "direct_pii", "task_type": "draft_message",
        "expected_decision": "redact", "combo_risk": False,
        "notes": "Name+phone+email update request.",
    }


def _tmpl_direct_pii_email_only(rng: _random.Random) -> tuple[str, dict]:
    name = _make_name(rng)
    email = _make_email(name, rng)
    annotated = (
        f"Send the weekly report to [[PERSON|{name}]] at [[EMAIL|{email}]] please."
    )
    return annotated, {
        "category": "direct_pii", "task_type": "draft_message",
        "expected_decision": "redact", "combo_risk": False,
        "notes": "Name+email; no phone.",
    }


def _tmpl_direct_pii_name_only(rng: _random.Random) -> tuple[str, dict]:
    name = _make_name(rng)
    annotated = f"Summarise the performance of [[PERSON|{name}]] from last quarter."
    return annotated, {
        "category": "direct_pii", "task_type": "summarize",
        "expected_decision": "allow", "combo_risk": False,
        "notes": "Isolated name — allow under ALLOW_PERSON_ALONE.",
    }


def _tmpl_india_aadhaar_valid(rng: _random.Random) -> tuple[str, dict]:
    uid = _make_aadhaar(rng, valid=True)
    formatted = f"{uid[:4]} {uid[4:8]} {uid[8:]}"
    annotated = f"Verify Aadhaar [[GOV_ID|{formatted}]] for KYC."
    return annotated, {
        "category": "india_ids", "task_type": "verify_identifier",
        "expected_decision": "redact", "combo_risk": False,
        "notes": "Valid Verhoeff Aadhaar.",
    }


def _tmpl_india_aadhaar_invalid(rng: _random.Random) -> tuple[str, dict]:
    uid = _make_aadhaar(rng, valid=False)
    formatted = f"{uid[:4]} {uid[4:8]} {uid[8:]}"
    annotated = f"Aadhaar [[GOV_ID|{formatted}]] failed validation."
    return annotated, {
        "category": "india_ids", "task_type": "verify_identifier",
        "expected_decision": "require_approval", "combo_risk": False,
        "notes": "Invalid Verhoeff — require_approval.",
    }


def _tmpl_india_pan(rng: _random.Random) -> tuple[str, dict]:
    pan = _make_pan(rng, valid=True)
    annotated = f"PAN [[GOV_ID|{pan}]] submitted for income tax filing."
    return annotated, {
        "category": "india_ids", "task_type": "verify_identifier",
        "expected_decision": "redact", "combo_risk": False,
        "notes": "Valid PAN.",
    }


def _tmpl_india_gstin(rng: _random.Random) -> tuple[str, dict]:
    gstin = _make_gstin(rng)
    annotated = f"GSTIN [[GOV_ID|{gstin}]] needs registration update."
    return annotated, {
        "category": "india_ids", "task_type": "draft_document",
        "expected_decision": "redact", "combo_risk": False,
        "notes": "Valid GSTIN with checksum.",
    }


def _tmpl_india_bank_ifsc(rng: _random.Random) -> tuple[str, dict]:
    account = _make_bank_account(rng)
    ifsc = _make_ifsc(rng)
    amount = f"₹{rng.randint(5000, 200000):,}"
    annotated = (
        f"Transfer {amount} to account [[FINANCIAL_ACCOUNT|{account}]] "
        f"via IFSC [[FINANCIAL_ACCOUNT|{ifsc}]]."
    )
    text, _ = parse_markup(annotated)
    return annotated, {
        "category": "india_ids", "task_type": "draft_message",
        "expected_decision": "redact", "combo_risk": False,
        "required_spans_values": [amount],
        "notes": "Bank account + IFSC; amount retained.",
    }


def _tmpl_india_upi(rng: _random.Random) -> tuple[str, dict]:
    name = _make_name(rng)
    upi = _make_upi(name, rng)
    annotated = f"Please pay via UPI to [[FINANCIAL_ACCOUNT|{upi}]]."
    return annotated, {
        "category": "india_ids", "task_type": "draft_message",
        "expected_decision": "redact", "combo_risk": False,
        "notes": "UPI VPA — pseudonymized.",
    }


def _tmpl_secrets_aws(rng: _random.Random) -> tuple[str, dict]:
    key = _make_aws_key(rng)
    annotated = (
        f"Debug this snippet: import boto3; client = boto3.client('s3', "
        f"aws_access_key_id='[[SECRET|{key}]]')."
    )
    return annotated, {
        "category": "secrets", "task_type": "debug_code",
        "expected_decision": "block", "combo_risk": False,
        "notes": "AWS access key in code — block.",
    }


def _tmpl_secrets_github(rng: _random.Random) -> tuple[str, dict]:
    token = _make_github_token(rng)
    annotated = (
        f"Use token [[SECRET|{token}]] to authenticate and push to the repo."
    )
    return annotated, {
        "category": "secrets", "task_type": "draft_message",
        "expected_decision": "block", "combo_risk": False,
        "notes": "GitHub PAT — block.",
    }


def _tmpl_secrets_stripe(rng: _random.Random) -> tuple[str, dict]:
    key = _make_stripe_key(rng)
    annotated = f"Is STRIPE_SECRET_KEY=[[SECRET|{key}]] valid for production?"
    return annotated, {
        "category": "secrets", "task_type": "debug_code",
        "expected_decision": "block", "combo_risk": False,
        "notes": "Stripe live key — block.",
    }


def _tmpl_secrets_slack(rng: _random.Random) -> tuple[str, dict]:
    token = _make_slack_token(rng)
    annotated = f"Slack bot token [[SECRET|{token}]] — is it still valid?"
    return annotated, {
        "category": "secrets", "task_type": "general_qa",
        "expected_decision": "block", "combo_risk": False,
        "notes": "Slack bot token — block.",
    }


def _tmpl_financial_card_analysis(rng: _random.Random) -> tuple[str, dict]:
    card = _make_credit_card(rng)
    amount = f"₹{rng.randint(1000, 50000):,}"
    merchant = rng.choice(["Zara", "Swiggy", "Myntra", "Amazon", "BookMyShow"])
    date = f"{rng.randint(1, 28)} {rng.choice(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])}"
    annotated = (
        f"Analyze transaction: card [[FINANCIAL_ACCOUNT|{card}]] spent {amount} "
        f"at {merchant} on {date}. Flag if unusual."
    )
    text, _ = parse_markup(annotated)
    return annotated, {
        "category": "financial", "task_type": "analyze_data",
        "expected_decision": "redact", "combo_risk": False,
        "required_spans_values": [amount, date],
        "notes": "Card masked; amount+date retained.",
    }


def _tmpl_financial_amounts_only(rng: _random.Random) -> tuple[str, dict]:
    q = [f"₹{rng.randint(10, 200) * 10000:,}" for _ in range(4)]
    quarters = ["Q1", "Q2", "Q3", "Q4"]
    parts = ", ".join(f"{quarters[i]} {q[i]}" for i in range(4))
    annotated = f"Summarize quarterly revenue: {parts}. Identify trends."
    return annotated, {
        "category": "financial", "task_type": "summarize",
        "expected_decision": "allow", "combo_risk": False,
        "required_spans_values": q,
        "notes": "Amounts only — allow; amounts retained.",
    }


def _tmpl_indirect_combo_age_role_org_event(rng: _random.Random) -> tuple[str, dict]:
    age = rng.randint(25, 58)
    role = rng.choice(ROLES)
    company = rng.choice(FICTIONAL_COMPANIES)
    city = rng.choice(INDIAN_CITIES)
    event = rng.choice(SENSITIVE_EVENTS)
    task = rng.choice(["draft_document", "analyze_data", "draft_message"])
    annotated = (
        f"Draft feedback for the [[QUASI|{age}-year-old]] [[QUASI|{role}]] "
        f"at [[QUASI|{company}]]'s [[QUASI|{city}]] office "
        f"who recently went on [[QUASI|{event}]]."
    )
    return annotated, {
        "category": "indirect_combo", "task_type": task,
        "expected_decision": "require_approval", "combo_risk": True,
        "notes": f"Indirect combo: age={age}, role, org, location, event.",
    }


def _tmpl_indirect_combo_no_name(rng: _random.Random) -> tuple[str, dict]:
    role = rng.choice(ROLES)
    company = rng.choice(FICTIONAL_COMPANIES)
    city = rng.choice(INDIAN_CITIES)
    event = rng.choice(SENSITIVE_EVENTS)
    annotated = (
        f"Write a support letter for the [[QUASI|{role}]] at [[QUASI|{company}]] "
        f"in [[QUASI|{city}]] who experienced [[QUASI|{event}]] last month."
    )
    return annotated, {
        "category": "indirect_combo", "task_type": "draft_document",
        "expected_decision": "require_approval", "combo_risk": True,
        "notes": "No name or direct ID — combo risk from role+org+city+event.",
    }


def _tmpl_indirect_benign_general(rng: _random.Random) -> tuple[str, dict]:
    topics = [
        "team-building activities for a mid-sized technology company",
        "best practices for remote onboarding",
        "how to improve code review quality",
        "strategies for reducing meeting fatigue",
        "how to structure a quarterly business review",
    ]
    topic = rng.choice(topics)
    annotated = f"What are some good {topic}?"
    return annotated, {
        "category": "indirect_combo", "task_type": "general_qa",
        "expected_decision": "allow", "combo_risk": False,
        "notes": "HARD NEGATIVE — generic question, no quasi-identifiers.",
    }


def _tmpl_medical_with_identity(rng: _random.Random) -> tuple[str, dict]:
    name = _make_name(rng)
    condition = rng.choice(MEDICAL_CONDITIONS)
    medication = rng.choice(MEDICATIONS)
    role_context = rng.choice(["patient", "employee", "applicant"])
    annotated = (
        f"The {role_context} [[PERSON|{name}]] was diagnosed with "
        f"[[MEDICAL|{condition}]] and prescribed [[MEDICAL|{medication}]]."
    )
    return annotated, {
        "category": "medical", "task_type": "draft_document",
        "expected_decision": "redact", "combo_risk": False,
        "notes": "Medical + named individual — HEALTH_WITH_IDENTITY triggers redact.",
    }


def _tmpl_medical_generic(rng: _random.Random) -> tuple[str, dict]:
    condition = rng.choice(MEDICAL_CONDITIONS)
    medication = rng.choice(MEDICATIONS)
    ctx = rng.choice([
        "clinical trials",
        "pharmacology research",
        "medical education",
        "public health reports",
    ])
    annotated = (
        f"Summarize findings on [[MEDICAL|{condition}]] treatment using "
        f"[[MEDICAL|{medication}]] from recent {ctx}."
    )
    text, _ = parse_markup(annotated)
    return annotated, {
        "category": "medical", "task_type": "summarize",
        "expected_decision": "allow", "combo_risk": False,
        "required_spans_values": [condition, medication],
        "notes": "Medical terms in research context — no identity — allow.",
    }


def _tmpl_utility_analysis(rng: _random.Random) -> tuple[str, dict]:
    cols = [f"₹{rng.randint(1, 50) * 10000:,}" for _ in range(3)]
    months = rng.sample(["January", "February", "March", "April", "May",
                         "June", "July", "August", "September"], 3)
    pairs = ", ".join(f"{m}: {c}" for m, c in zip(months, cols))
    annotated = f"Analyze the sales data and identify trends: {pairs}."
    return annotated, {
        "category": "utility_tasks", "task_type": "analyze_data",
        "expected_decision": "allow", "combo_risk": False,
        "required_spans_values": cols,
        "notes": "Pure analysis — amounts retained.",
    }


def _tmpl_utility_draft(rng: _random.Random) -> tuple[str, dict]:
    doc_types = ["quarterly report", "project update", "meeting minutes", "policy document"]
    company = rng.choice(FICTIONAL_COMPANIES)
    doc_type = rng.choice(doc_types)
    annotated = f"Draft a {doc_type} for [[QUASI|{company}]] summarizing FY2025 performance."
    return annotated, {
        "category": "utility_tasks", "task_type": "draft_document",
        "expected_decision": "allow", "combo_risk": False,
        "required_spans_values": ["FY2025"],
        "notes": "Drafting task — company name quasi but not personal.",
    }


def _tmpl_hard_neg_order_number(rng: _random.Random) -> tuple[str, dict]:
    num = "".join(str(rng.randint(0, 9)) for _ in range(10))
    annotated = f"Order #ORD-{num} has been dispatched."
    return annotated, {
        "category": "hard_negatives", "task_type": "general_qa",
        "expected_decision": "allow", "combo_risk": False,
        "required_spans_values": [f"ORD-{num}"],
        "notes": "Order number prefixed ORD- — not mobile.",
    }


def _tmpl_hard_neg_historical_figure(rng: _random.Random) -> tuple[str, dict]:
    figures = [
        ("Mahatma Gandhi", "Porbandar", "1869"),
        ("Albert Einstein", "Ulm", "1879"),
        ("Marie Curie", "Warsaw", "1867"),
        ("Rabindranath Tagore", "Kolkata", "1861"),
        ("APJ Abdul Kalam", "Rameswaram", "1931"),
    ]
    name, place, year = rng.choice(figures)
    annotated = f"[[PERSON|{name}]] was born in {year} in {place}."
    return annotated, {
        "category": "hard_negatives", "task_type": "general_qa",
        "expected_decision": "allow", "combo_risk": False,
        "required_spans_values": [year, place],
        "notes": "Historical public figure — name alone should be allow.",
    }


def _tmpl_hard_neg_currency_amount(rng: _random.Random) -> tuple[str, dict]:
    amount = f"₹{rng.randint(10000, 9999999):,}"
    service = rng.choice(["consulting", "software development", "design", "auditing"])
    annotated = f"The invoice for {service} services amounts to {amount}."
    return annotated, {
        "category": "hard_negatives", "task_type": "analyze_data",
        "expected_decision": "allow", "combo_risk": False,
        "required_spans_values": [amount],
        "notes": "Currency amount — not an account or card number.",
    }


def _tmpl_hard_neg_meeting_time(rng: _random.Random) -> tuple[str, dict]:
    hour = rng.randint(9, 17)
    minute = rng.choice(["00", "15", "30", "45"])
    room = rng.randint(100, 500)
    annotated = f"The meeting is at {hour}:{minute} in Room {room}."
    return annotated, {
        "category": "hard_negatives", "task_type": "draft_message",
        "expected_decision": "allow", "combo_risk": False,
        "required_spans_values": [f"{hour}:{minute}", f"Room {room}"],
        "notes": "Meeting time — not a phone number.",
    }




TEMPLATE_FAMILIES: dict[str, Any] = {
    "direct_pii_name_phone_email": (_tmpl_direct_pii_name_phone_email, 30),
    "direct_pii_email_only": (_tmpl_direct_pii_email_only, 20),
    "direct_pii_name_only": (_tmpl_direct_pii_name_only, 16),
    "india_aadhaar_valid": (_tmpl_india_aadhaar_valid, 20),
    "india_aadhaar_invalid": (_tmpl_india_aadhaar_invalid, 14),
    "india_pan": (_tmpl_india_pan, 18),
    "india_gstin": (_tmpl_india_gstin, 16),
    "india_bank_ifsc": (_tmpl_india_bank_ifsc, 18),
    "india_upi": (_tmpl_india_upi, 14),
    "secrets_aws": (_tmpl_secrets_aws, 16),
    "secrets_github": (_tmpl_secrets_github, 14),
    "secrets_stripe": (_tmpl_secrets_stripe, 12),
    "secrets_slack": (_tmpl_secrets_slack, 12),
    "financial_card": (_tmpl_financial_card_analysis, 22),
    "financial_amounts_only": (_tmpl_financial_amounts_only, 16),
    "indirect_combo_age_role": (_tmpl_indirect_combo_age_role_org_event, 28),
    "indirect_combo_no_name": (_tmpl_indirect_combo_no_name, 22),
    "indirect_benign": (_tmpl_indirect_benign_general, 14),
    "medical_with_identity": (_tmpl_medical_with_identity, 24),
    "medical_generic": (_tmpl_medical_generic, 18),
    "utility_analysis": (_tmpl_utility_analysis, 18),
    "utility_draft": (_tmpl_utility_draft, 14),
    "hard_neg_order": (_tmpl_hard_neg_order_number, 16),
    "hard_neg_historical": (_tmpl_hard_neg_historical_figure, 14),
    "hard_neg_currency": (_tmpl_hard_neg_currency_amount, 14),
    "hard_neg_meeting": (_tmpl_hard_neg_meeting_time, 14),
}

# Explicit split assignments — frozen at v1. Each family wholly in one split.
# Each category deliberately has at least one family in dev and one in test.
FAMILY_SPLIT_OVERRIDE: dict[str, str] = {
    "direct_pii_name_phone_email": "test",
    "direct_pii_email_only": "dev",
    "direct_pii_name_only": "test",
    "india_aadhaar_valid": "dev",
    "india_aadhaar_invalid": "test",
    "india_pan": "test",
    "india_gstin": "dev",
    "india_bank_ifsc": "test",
    "india_upi": "dev",
    "secrets_aws": "dev",
    "secrets_github": "test",
    "secrets_stripe": "dev",
    "secrets_slack": "test",
    "financial_card": "dev",
    "financial_amounts_only": "test",
    "indirect_combo_age_role": "test",
    "indirect_combo_no_name": "dev",
    "indirect_benign": "test",
    "medical_with_identity": "test",
    "medical_generic": "dev",
    "utility_analysis": "dev",
    "utility_draft": "test",
    "hard_neg_order": "dev",
    "hard_neg_historical": "test",
    "hard_neg_currency": "dev",
    "hard_neg_meeting": "test",
}


# ─── Split assignment ──────────────────────────────────────────────────────────

def _family_split(family_key: str) -> str:
    """Return the split for a template family using explicit override table.

    Each family is deterministically in one split to prevent near-duplicate
    contamination across splits. FAMILY_SPLIT_OVERRIDE is the authoritative
    source; hash fallback is kept for any future families not yet listed.
    """
    if family_key in FAMILY_SPLIT_OVERRIDE:
        return FAMILY_SPLIT_OVERRIDE[family_key]
    # Hash fallback for unlisted families (should not occur in v1)
    h = int(hashlib.sha256(f"{SEED}:{family_key}".encode()).hexdigest()[:8], 16)
    return "dev" if h % 2 == 0 else "test"


def _handwritten_split(item_id: str) -> str:
    """Deterministically assign handwritten item to dev or test by hash of id."""
    h = int(hashlib.sha256(f"{SEED}:hw:{item_id}".encode()).hexdigest()[:8], 16)
    return "dev" if h % 2 == 0 else "test"


# ─── Record builder ────────────────────────────────────────────────────────────

def _build_record(
    item_id: str,
    split: str,
    family: str,
    annotated: str,
    meta: dict,
) -> dict:
    """Build a JSONL record from annotated text and metadata."""
    text, entities = parse_markup(annotated)
    required_spans: list[dict] = []
    for v in meta.get("required_spans_values", []):
        s = _required_span(text, v)
        if s:
            required_spans.append(s)

    return {
        "id": item_id,
        "split": split,
        "family": family,
        "category": meta["category"],
        "text": text,
        "task_type": meta["task_type"],
        "expected_entities": entities,
        "expected_decision": meta["expected_decision"],
        "required_spans": required_spans,
        "combo_risk": meta.get("combo_risk", False),
        "notes": meta.get("notes", ""),
    }


# ─── Process handwritten items ─────────────────────────────────────────────────

def _process_handwritten() -> list[dict]:
    hw_path = BENCH_DATA / "handwritten.yaml"
    with open(hw_path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)

    records = []
    for item in doc["items"]:
        iid = item["id"]
        split = _handwritten_split(iid)
        text = item["text"]

        # Convert value-based entity references to offset-based
        entities = []
        for ent in item.get("expected_entities", []):
            value = ent.get("value", "")
            if not value:
                continue
            idx = text.find(value)
            if idx == -1:
                # Try case-insensitive
                lower = text.lower()
                idx = lower.find(value.lower())
            if idx == -1:
                print(f"  WARNING: Entity value not found in text for {iid}: {value!r}", file=sys.stderr)
                continue
            entities.append({
                "start": idx,
                "end": idx + len(value),
                "group": ent["group"],
            })

        # required_spans: also value-based
        req_spans = []
        for rs in item.get("required_spans", []):
            value = rs.get("value", "")
            if not value:
                continue
            idx = text.find(value)
            if idx != -1:
                req_spans.append({"start": idx, "end": idx + len(value)})

        record = {
            "id": iid,
            "split": split,
            "family": f"handwritten:{iid}",
            "category": item["category"],
            "text": text,
            "task_type": item["task_type"],
            "expected_entities": entities,
            "expected_decision": item["expected_decision"],
            "required_spans": req_spans,
            "combo_risk": item.get("combo_risk", False),
            "notes": item.get("notes", ""),
        }
        records.append(record)

    return records


# ─── Main generation ───────────────────────────────────────────────────────────

def generate() -> None:
    """Generate dev.jsonl, test.jsonl, and MANIFEST.json."""
    BENCH_DATA.mkdir(parents=True, exist_ok=True)

    all_records: list[dict] = []
    global_counter = {"dev": 0, "test": 0}
    item_idx = {"dev": 0, "test": 0}

    # 1. Process handwritten cases
    print("Processing handwritten cases...")
    hw_records = _process_handwritten()
    for rec in hw_records:
        all_records.append(rec)
        global_counter[rec["split"]] += 1
    print(f"  Handwritten: {sum(global_counter.values())} total ({global_counter})")

    # 2. Generate template-based cases
    print("Generating template-based cases...")
    for family_key, (fn, n_total) in TEMPLATE_FAMILIES.items():
        split = _family_split(family_key)
        family_rng = _rng_fork(family_key)
        prefix = "dev" if split == "dev" else "tst"

        for i in range(n_total):
            item_idx[split] += 1
            item_id = f"{prefix}-{family_key[:12]}-{i + 1:03d}"
            try:
                annotated, meta = fn(family_rng)
            except Exception as e:
                print(f"  ERROR generating {family_key} item {i+1}: {e}", file=sys.stderr)
                continue

            rec = _build_record(item_id, split, family_key, annotated, meta)
            all_records.append(rec)
            global_counter[split] += 1

    print(f"  Template-based: dev={global_counter['dev'] - len([r for r in hw_records if r['split'] == 'dev'])}, "
          f"test={global_counter['test'] - len([r for r in hw_records if r['split'] == 'test'])}")
    print(f"  Total: {len(all_records)} ({global_counter})")

    # 3. Category breakdown verification
    cat_counts: dict[str, dict[str, int]] = {}
    for rec in all_records:
        cat = rec["category"]
        sp = rec["split"]
        cat_counts.setdefault(cat, {"dev": 0, "test": 0})
        cat_counts[cat][sp] += 1

    print("\nCategory breakdown:")
    for cat, counts in sorted(cat_counts.items()):
        flag = " [LOW]" if counts.get("test", 0) < 15 else ""
        print(f"  {cat:<20}: dev={counts.get('dev', 0):4d}, test={counts.get('test', 0):4d}{flag}")

    # 4. Write JSONL files
    dev_records = [r for r in all_records if r["split"] == "dev"]
    test_records = [r for r in all_records if r["split"] == "test"]

    dev_path = BENCH_DATA / "dev.jsonl"
    test_path = BENCH_DATA / "test.jsonl"

    with open(dev_path, "w", encoding="utf-8") as f:
        for rec in dev_records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    with open(test_path, "w", encoding="utf-8") as f:
        for rec in test_records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # 5. Compute SHA-256 hashes
    def _sha256(path: Path) -> str:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()

    dev_hash = _sha256(dev_path)
    test_hash = _sha256(test_path)

    # 6. Write MANIFEST.json
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {
        "version": "v1",
        "created_at": now_iso,
        "generator_seed": SEED,
        "splits": {
            "dev": {
                "count": len(dev_records),
                "sha256": dev_hash,
                "categories": {cat: counts.get("dev", 0) for cat, counts in sorted(cat_counts.items())},
            },
            "test": {
                "count": len(test_records),
                "sha256": test_hash,
                "categories": {cat: counts.get("test", 0) for cat, counts in sorted(cat_counts.items())},
            },
        },
        "history": [
            {
                "event": "initial_freeze",
                "created_at": now_iso,
                "dev_sha256": dev_hash,
                "test_sha256": test_hash,
                "note": "Dataset v1 frozen. test.jsonl must not be modified.",
            }
        ],
        "integrity_note": (
            "test.jsonl is sealed after this commit. "
            "The no-peek rule cannot be technically enforced because the same team "
            "authored the dataset and the intelligence code. "
            "See docs/BENCHMARK.md for the full limitation disclosure."
        ),
    }

    manifest_path = BENCH_DATA / "MANIFEST.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\n[OK] dev.jsonl: {len(dev_records)} records  sha256={dev_hash[:16]}...")
    print(f"[OK] test.jsonl: {len(test_records)} records  sha256={test_hash[:16]}...")
    print("[OK] MANIFEST.json written")
    print(f"\nTotal items: {len(all_records)}")

    # Acceptance checks
    assert len(dev_records) >= 120, f"dev split too small: {len(dev_records)}"
    assert len(test_records) >= 120, f"test split too small: {len(test_records)}"
    low_cats = []
    for cat, counts in cat_counts.items():
        if counts.get("test", 0) < 15:
            low_cats.append(cat)
            print(f"  WARNING: {cat} has only {counts.get('test', 0)} test items (need >=15)")

    if not low_cats:
        print("\nAll acceptance checks passed.")
    else:
        print(f"\nWARNING: {len(low_cats)} categories have fewer than 15 test items: {low_cats}")



if __name__ == "__main__":
    generate()
