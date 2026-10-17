import re
from typing import TYPE_CHECKING, Dict, List, Optional, Set, Tuple

from veilguard_engine.models import Finding
from veilguard_engine.policy.models import Action, PolicyResult
from veilguard_engine.sanitizer.models import (
    KnownPlaceholder,
    ReplacementItem,
    SanitizeExplanation,
    SanitizeResult,
    SanitizeVerification,
    UtilityNotice,
)
from veilguard_engine.utils import codepoint_to_utf16_offset

if TYPE_CHECKING:
    from veilguard_engine.scanner import Scanner

# Canonical label mapping for type-based pseudonymization
ENTITY_LABEL_MAP: Dict[str, str] = {
    # Identity & Personal
    "PERSON": "PERSON",
    "PHONE_NUMBER": "PHONE",
    "IN_MOBILE": "PHONE",
    "EMAIL": "EMAIL",
    "EMAIL_ADDRESS": "EMAIL",
    "LOCATION": "LOCATION",
    "IP_ADDRESS": "IP_ADDRESS",
    # Government IDs
    "IN_AADHAAR": "AADHAAR",
    "IN_PAN": "PAN",
    "IN_GSTIN": "GSTIN",
    "US_SSN": "SSN",
    "US_PASSPORT": "PASSPORT",
    "US_DRIVER_LICENSE": "DRIVER_LICENSE",
    "US_ITIN": "ITIN",
    "UK_NHS": "NHS",
    # Financial
    "CREDIT_CARD": "CARD",
    "IN_BANK_ACCOUNT": "ACCOUNT",
    "IBAN_CODE": "IBAN",
    "CRYPTO": "CRYPTO",
    "UPI_ID": "UPI",
    "IN_IFSC": "IFSC",
    # Confidential
    "WATCHLIST_TERM": "TERM",
    "CONFIDENTIAL_TERM": "TERM",
    # Secrets & Credentials
    "API_KEY": "SECRET",
    "AWS_ACCESS_KEY": "SECRET",
    "GITHUB_TOKEN": "SECRET",
    "SLACK_TOKEN": "SECRET",
    "GOOGLE_API_KEY": "SECRET",
    "STRIPE_KEY": "SECRET",
    "JWT_TOKEN": "SECRET",
    "PRIVATE_KEY": "SECRET",
    "CONNECTION_STRING": "SECRET",
    "GENERIC_SECRET": "SECRET",
}

# Entity types supporting partial masking (preserving separators and last 4 digits)
MASKABLE_ENTITY_TYPES: Set[str] = {
    "CREDIT_CARD",
    "IN_BANK_ACCOUNT",
    "IN_AADHAAR",
}

# Role noun mappings for role-based person placeholders (Phase 5 Part C3)
ROLE_NOUN_MAP: Dict[str, str] = {
    "customer": "CUSTOMER",
    "client": "CLIENT",
    "patient": "PATIENT",
    "employee": "EMPLOYEE",
    "staff": "EMPLOYEE",
    "applicant": "CANDIDATE",
    "candidate": "CANDIDATE",
    "student": "STUDENT",
    "user": "USER",
    "borrower": "BORROWER",
    "tenant": "TENANT",
    "member": "MEMBER",
}

# Known canonical placeholder labels
KNOWN_PLACEHOLDER_LABELS: Set[str] = set(ENTITY_LABEL_MAP.values()) | set(ROLE_NOUN_MAP.values())
PLACEHOLDER_TOKEN_PATTERN = re.compile(r"^\[([A-Z0-9_]+)_(\d+)\]$")


def find_preceding_role(text: str, start_offset: int) -> Optional[str]:
    """Find the nearest preceding role noun within 3 tokens before start_offset."""
    prefix = text[:start_offset]
    tokens = re.findall(r"\b[A-Za-z0-9_-]+\b", prefix)
    if not tokens:
        return None
    for tok in reversed(tokens[-3:]):
        role_label = ROLE_NOUN_MAP.get(tok.lower())
        if role_label:
            return role_label
    return None


def is_generated_placeholder(token: str) -> bool:
    """Check if token is an exact generated placeholder [LABEL_N] or [SECRET_REMOVED]."""
    if token == "[SECRET_REMOVED]":
        return True
    m = PLACEHOLDER_TOKEN_PATTERN.match(token)
    if m and m.group(1) in KNOWN_PLACEHOLDER_LABELS:
        return True
    return False



def mask_value(val: str) -> str:
    """Mask string keeping only the last 4 digits and preserving separators.

    Example:
      '5678 9012 3456' -> 'XXXX XXXX 3456'
      '4532-0000-0000-0009' -> 'XXXX-XXXX-XXXX-0009'
      '123456789012' -> 'XXXXXXXX9012'
    """
    digits_indices = [i for i, c in enumerate(val) if c.isdigit()]
    if len(digits_indices) <= 4:
        return val

    unmasked_indices = set(digits_indices[-4:])
    chars: List[str] = []
    for i, c in enumerate(val):
        if c.isdigit():
            chars.append(c if i in unmasked_indices else "X")
        else:
            chars.append(c)
    return "".join(chars)


class Sanitizer:
    """Utility-preserving prompt sanitizer producing consistent placeholders, masks, or removals."""

    def __init__(
        self,
        scanner: Optional["Scanner"] = None,
        role_placeholders: Optional[bool] = None,
    ):
        if scanner is None:
            from veilguard_engine.scanner import Scanner
            self.scanner = Scanner()
        else:
            self.scanner = scanner

        if role_placeholders is None:
            import os
            self.role_placeholders = os.getenv("VEILGUARD_ROLE_PH", "0").lower() in ("1", "true", "yes")
        else:
            self.role_placeholders = role_placeholders

    def sanitize(
        self,
        text: str,
        findings: List[Finding],
        policy_result: PolicyResult,
        known_placeholders: Optional[List[KnownPlaceholder]] = None,
        role_placeholders: Optional[bool] = None,
    ) -> SanitizeResult:
        """Sanitize text according to policy actions with strict consistency and verification."""
        use_role_ph = self.role_placeholders if role_placeholders is None else role_placeholders

        # 1. Initialize placeholder registry for cross-turn and intra-turn consistency
        existing_mappings: Dict[Tuple[str, str], str] = {}
        label_max_index: Dict[str, int] = {}
        entity_role_labels: Dict[str, str] = {}

        if known_placeholders:
            for kp in known_placeholders:
                m = re.match(r"^\[([A-Z0-9_]+)_(\d+)\]$", kp.placeholder)
                if m:
                    label = m.group(1)
                    idx = int(m.group(2))
                    label_max_index[label] = max(label_max_index.get(label, 0), idx)
                else:
                    label = ENTITY_LABEL_MAP.get(kp.entity_type, kp.entity_type.upper())
                norm_val = " ".join(kp.value.lower().split())
                existing_mappings[(label, norm_val)] = kp.placeholder
                if kp.entity_type == "PERSON":
                    entity_role_labels[norm_val] = label

        # 2. Plan replacements for findings that require sanitization
        # Sort findings strictly by start offset ascending
        sorted_findings = sorted(findings, key=lambda f: (f.start, f.end))

        # Build rule_id lookup for explanations
        finding_rule_map: Dict[str, Tuple[str, str]] = {}
        for ar in policy_result.applied_rules:
            for fid in ar.finding_ids:
                if fid not in finding_rule_map:
                    finding_rule_map[fid] = (ar.rule_id, ar.reason)

        planned_replacements = []
        explanations: List[SanitizeExplanation] = []
        notes: List[str] = []

        for f in sorted_findings:
            action = policy_result.per_finding_actions.get(f.id, Action.KEEP)
            if action == Action.KEEP:
                continue

            orig_val = text[f.start : f.end]
            rule_id, rule_reason = finding_rule_map.get(
                f.id, ("POLICY_DEFAULT", "Policy action applied.")
            )

            if action == Action.MASK and f.entity_type not in MASKABLE_ENTITY_TYPES:
                # Fall back to pseudonymize for types without mask support
                action = Action.PSEUDONYMIZE
                notes.append(
                    f"Masking not supported for entity type '{f.entity_type}'; fell back to pseudonymization."
                )

            if action == Action.REMOVE:
                replacement_str = "[SECRET_REMOVED]"
                placeholder_val = "[SECRET_REMOVED]"
                reversible = False
            elif action == Action.MASK:
                replacement_str = mask_value(orig_val)
                placeholder_val = replacement_str
                reversible = False
            elif action == Action.PSEUDONYMIZE:
                norm_val = " ".join(orig_val.lower().split())

                if f.entity_type == "PERSON" and use_role_ph:
                    if norm_val in entity_role_labels:
                        label = entity_role_labels[norm_val]
                    else:
                        role = find_preceding_role(text, f.start)
                        label = role if role else "PERSON"
                        entity_role_labels[norm_val] = label
                else:
                    label = ENTITY_LABEL_MAP.get(
                        f.entity_type, re.sub(r"[^A-Z0-9]", "_", f.entity_type.upper())
                    )

                norm_key = (label, norm_val)

                if norm_key in existing_mappings:
                    ph = existing_mappings[norm_key]
                else:
                    next_idx = label_max_index.get(label, 0) + 1
                    label_max_index[label] = next_idx
                    ph = f"[{label}_{next_idx}]"
                    existing_mappings[norm_key] = ph

                replacement_str = ph
                placeholder_val = ph
                reversible = True
            else:
                continue

            planned_replacements.append(
                {
                    "finding": f,
                    "action": action,
                    "replacement_str": replacement_str,
                    "placeholder_val": placeholder_val,
                    "reversible": reversible,
                }
            )

            explanations.append(
                SanitizeExplanation(
                    entity_type=f.entity_type,
                    action=action,
                    rule_id=rule_id,
                    reason=rule_reason,
                )
            )

        # 3. Construct sanitized text and calculate exact new offsets
        pieces: List[str] = []
        replacements: List[ReplacementItem] = []
        last_idx = 0
        current_cp_offset = 0

        for item in planned_replacements:
            f = item["finding"]
            prefix = text[last_idx : f.start]
            pieces.append(prefix)
            current_cp_offset += len(prefix)

            new_start_cp = current_cp_offset
            repl_str = item["replacement_str"]
            pieces.append(repl_str)
            current_cp_offset += len(repl_str)
            new_end_cp = current_cp_offset

            last_idx = f.end

            item["new_start_cp"] = new_start_cp
            item["new_end_cp"] = new_end_cp

        pieces.append(text[last_idx:])
        sanitized_text = "".join(pieces)

        # Convert offsets to UTF-16 code units for API response
        for item in planned_replacements:
            f = item["finding"]
            orig_start_u16 = codepoint_to_utf16_offset(text, f.start)
            orig_end_u16 = codepoint_to_utf16_offset(text, f.end)
            new_start_u16 = codepoint_to_utf16_offset(sanitized_text, item["new_start_cp"])
            new_end_u16 = codepoint_to_utf16_offset(sanitized_text, item["new_end_cp"])

            replacements.append(
                ReplacementItem(
                    finding_id=f.id,
                    original_start=orig_start_u16,
                    original_end=orig_end_u16,
                    new_start=new_start_u16,
                    new_end=new_end_u16,
                    action=item["action"],
                    placeholder=item["placeholder_val"],
                    reversible=item["reversible"],
                )
            )

        # 4. Utility Notice
        if replacements:
            may_change = "possible"
            notes.append(
                "An exact value was replaced. If your task needs the exact value, edit the prompt or choose the approval path."
            )
        else:
            may_change = "low"
            notes.append("No modifications were required for the input prompt.")

        utility = UtilityNotice(
            basis="type_only",
            may_change_result=may_change,
            notes=notes,
        )

        # 5. Post-Sanitization Re-Scan Verification
        verification = self._verify_sanitized(sanitized_text)

        return SanitizeResult(
            sanitized_text=sanitized_text,
            replacements=replacements,
            explanations=explanations,
            utility=utility,
            verification=verification,
        )

    def _verify_sanitized(self, sanitized_text: str) -> SanitizeVerification:
        """Re-scan sanitized text to verify zero residual sensitive entities."""
        if not sanitized_text.strip():
            return SanitizeVerification(
                rescanned=True, residual_findings=0, residual_finding_types=[]
            )

        rescan_resp = self.scanner.scan(sanitized_text, source="prompt")
        residual_types: List[str] = []

        for f in rescan_resp.findings:
            matched_span = sanitized_text[f.start : f.end]
            # Ignore false positive detections that hit exact generated placeholder tokens
            if is_generated_placeholder(matched_span):
                continue
            residual_types.append(f.entity_type)


        return SanitizeVerification(
            rescanned=True,
            residual_findings=len(residual_types),
            residual_finding_types=residual_types,
        )
