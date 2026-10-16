# VeilGuard AI: Policy Engine Specification & Reference

> **Fail-Closed Invariant:** If a policy configuration file contains invalid YAML, unknown fields, unsupported decisions/actions, or if the default profile (`company`) is missing, the engine **refuses to start**. It never falls back silently to permissive execution.

---

## 1. Decision Semantics & Hierarchy

Decisions represent the deterministic determination made by evaluating detected findings against declarative YAML rules.

### Ordering (Weakest to Strongest)

$$\text{allow} < \text{redact} < \text{require\_approval} < \text{block}$$

When multiple rules match across findings in a single submission, **the strongest decision wins**.

| Decision | Meaning | Valid User Options (`options`) |
| :--- | :--- | :--- |
| `allow` | No policy violations or risks detected. Submission may proceed unchanged. | `["send_original"]` |
| `redact` | Sensitive data detected; sanitization is recommended and required. Only sanitized text may be submitted. | `["send_sanitized", "edit", "cancel"]` |
| `require_approval` | High-sensitivity or contextual findings detected. The user must review detected risks and choose whether to send sanitized or confirm sending original. | `["send_sanitized", "send_original_confirmed", "edit", "cancel"]` |
| `block` | Critical security or policy violations (e.g., active credentials, unmasked secrets). The submission is halted. | `["edit", "cancel"]` |

---

## 2. Action Hierarchy per Finding

When multiple rules apply to the same finding, **the strongest action wins**:

$$\text{keep} < \text{pseudonymize} < \text{mask} < \text{remove}$$

| Action | Description | Reversible? | Examples |
| :--- | :--- | :---: | :--- |
| `keep` | Leave entity value unchanged. Minimal sanitization. | N/A | Non-sensitive names in benign contexts |
| `pseudonymize` | Replace with consistent type-based placeholder (`[PERSON_1]`, `[PHONE_1]`). | **Yes** | Personal names, phone numbers, UPI VPAs |
| `mask` | Irreversible partial mask preserving separators and retaining only the last 4 digits. | **No** | `XXXX XXXX 3456`, `XXXX-XXXX-XXXX-0009` |
| `remove` | Replace with fixed token `[SECRET_REMOVED]`. | **No** | AWS keys, API tokens, database connection passwords |

---

## 3. Policy Schema Reference

Policy profile YAML files reside in `policies/` and are strictly validated using Pydantic (`extra="forbid"`).

```yaml
version: 1
profile: company
description: "Default for employees using external AI tools"
defaults:
  min_score: 0.4          # Findings below this confidence are ignored unless overridden by a rule
rules:
  - id: BLOCK_SECRETS
    description: "Secrets must never be sent to an AI service."
    when:                   # Optional primary condition (AND semantics)
      categories: [SECRET]
      entity_types: []      # Empty list = match any entity type in category
      min_score: 0.5
      validated: true       # Optional: require checksum/structural validator match
      sources: [prompt, document]
      destination_trust: [trusted, standard, untrusted]
      requires_none: []     # Optional: rule does NOT fire if any other finding matches these selectors
    requires_any: []        # Optional combination rule: fires only if at least one OTHER finding matches
    min_count: 1            # Minimum number of matching findings required to fire
    then:
      decision: block       # allow | redact | require_approval | block
      action: remove        # keep | pseudonymize | mask | remove
      also_apply_to_requires: false  # Whether to apply this action to findings that satisfied requires_any
    reason: "API keys, tokens and passwords must not be shared with external AI tools."
```

---

## 4. Destination Trust Levels (`policies/destinations.yaml`)

Destination hostnames are categorized into three deterministic trust tiers:

| Trust Tier | Description | Mapped Hostnames (Examples) |
| :--- | :--- | :--- |
| `trusted` | Internal enterprise services or verified zero-retention private endpoints | `internal.corp.local` |
| `standard` | Public commercial AI endpoints (default for unknown hosts and mock testbed) | `127.0.0.1`, `localhost`, `api.openai.com`, `claude.ai` |
| `untrusted` | Unverified, high-risk, or non-compliant external AI endpoints | `untrusted-ai.example.com` |

---

## 5. Standard Profile Matrix

VeilGuard AI includes three verified policy profiles out of the box:

| Sensitivity Scenario | `personal` | `company` (Default) | `finance` |
| :--- | :--- | :--- | :--- |
| **Any Secret / Credential** | `block, remove` | `block, remove` | `block, remove` |
| **Validated Government ID (Aadhaar, PAN)** | `redact, pseudonymize` | `redact, pseudonymize` | `block, pseudonymize` |
| **Payment Instrument (Card, Account)** | `redact, mask` | `redact, mask` | `redact, mask` |
| **UPI Virtual Address** | `redact, pseudonymize` | `redact, pseudonymize` | `redact, pseudonymize` |
| **Phone or Email Alone** | `require_approval, pseudonymize` | `redact, pseudonymize` | `redact, pseudonymize` |
| **Person Name Alone** | `allow, keep` | `allow, keep` | `allow, keep` |
| **Person + Contact/ID/Financial** | `redact, pseudonymize both` | `redact, pseudonymize both` | `redact, pseudonymize both` |
| **Confidential Watchlist Term** | `require_approval, pseudonymize` | `block` on untrusted, `require_approval` on standard | `block, remove` |
| **Unvalidated Government ID Pattern** | `require_approval, pseudonymize` | `require_approval, pseudonymize` | `block, pseudonymize` |
