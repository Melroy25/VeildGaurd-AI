# VeilGuard AI: Context Intelligence Architecture & Specifications

This document specifies the design, deterministic rules, heuristics, and invariants of VeilGuard AI's **Context Intelligence** pipeline implemented in Phase 5.

> [!IMPORTANT]
> All context intelligence components in VeilGuard are strictly deterministic and rule-based. In accordance with Rule 14, no non-deterministic third-party LLMs are used on the critical protection path. Furthermore, re-identification scores are heuristic indices, not formal empirical probabilities.

---

## 1. Task Profile Inference (`engine/veilguard_engine/context/task.py`)

VeilGuard infers the user's intended task using an ordered, deterministic lexical classification engine over the lowercased prompt text.

### Closed Task Set

| Task Type | Description | Primary Lexical Cues |
|:---|:---|:---|
| `analyze_data` | Financial, account, or transactional analysis | "analyze", "identify patterns", "spending habits", "transaction history" |
| `summarize` | Condensing text or extraction of key takeaways | "summarize", "tl;dr", "key takeaways", "brief overview" |
| `draft_document` | Authoring formal reports, reviews, or articles | "draft a review", "write a report", "draft performance review" |
| `draft_message` | Composing emails or correspondence to individuals | "write an email to", "draft a message to", "reply to" |
| `rewrite_edit` | Proofreading, tightening, or rephrasing text | "rewrite", "make concise", "proofread", "paraphrase" |
| `debug_code` | Inspecting code snippets, stack traces, or errors | "debug this", "fix the bug", "stack trace", "syntax error" |
| `verify_identifier`| Validating identity documents or KYC details | "verify this aadhaar", "validate pan", "kyc verification" |
| `lookup_contact` | Looking up or retrieving contact information | "find contact for", "lookup phone", "what is the email of" |
| `translate` | Language translation | "translate to", "translate into" |
| `general_qa` | General informational queries | "what is", "how do I", "explain" |
| `unknown` | Fallback when no cue matches or on cue tie | None |

### Confidence Tiers & Evidence Rules
- **`high`**: 2 or more independent cue patterns matched.
- **`medium`**: Exactly 1 cue pattern matched.
- **`low`**: Fallback / ambiguous match.
- **`task_hint` Override**: When `task_hint` is provided in `POST /analyze`, inference is bypassed, yielding `confidence: "high"` and `evidence: ["USER_HINT"]`.
- **Privacy Guarantee**: `evidence` arrays strictly contain rule IDs (e.g., `["T_ANALYZE_01", "T_ANALYZE_02"]`) or `["USER_HINT"]`. **Original prompt text or matched words are never returned in evidence or logs.**

### Limitations
- Task inference is strictly lexical and English-only. Non-English prompts or unconventional grammar default safely to `unknown`.

---

## 2. Task-Aware Necessity Matrix (`engine/veilguard_engine/necessity/`)

The necessity matrix defines whether an entity type or category is `required`, `optional`, or `unnecessary` for a given task type. When the task is `unknown`, all findings default to `optional` (conservative fallback).

### Necessity Resolution Table

| Task Type | Category / Entity Type | Necessity Level | Rationale |
|:---|:---|:---|:---|
| `analyze_data` | `PERSON`, `PHONE`, `EMAIL` | `unnecessary` | Aggregation does not require individual identities |
| `analyze_data` | `FINANCIAL` | `optional` | Account structure may provide useful context |
| `draft_message` | `PERSON` (Recipient) | `required` | Message must address the correct recipient |
| `draft_message` | `PHONE`, `EMAIL`, `GOV_ID` | `unnecessary` | Contact metadata is not needed in message body |
| `verify_identifier` | `GOV_ID` | `required` | Cannot verify an ID without inspecting the number |
| `verify_identifier` | `PERSON`, `PHONE` | `optional` | Corroborating identity details |
| `lookup_contact` | `PERSON` | `required` | Must specify who is being looked up |
| `lookup_contact` | `PHONE`, `EMAIL` | `required` | Target detail of the lookup |
| `debug_code` | `SECRET` | `unnecessary` | Secrets in code snippets must always be removed |
| `*` (Any task) | `SECRET` | `unnecessary` | Secrets are never required by any AI generation task |

### Policy Adjustment Invariants
1. **Invariant 1 (Security Fail-Closed)**: Necessity **never weakens a `block` decision**, and **never keeps a `SECRET`**. Government IDs that a policy profile blocks remain blocked.
2. **Invariant 2 (Required Escalation & Trade-Offs)**: If a finding is `required` by the task but the policy would otherwise pseudonymize, mask, or remove it:
   - Its action is adjusted to `keep`.
   - The overall decision is raised to at least `require_approval`.
   - A trade-off entry is appended: `"Task requires <type>; transmitting it exposes <category>"`.
3. **Invariant 3 (Conservative Default)**: When task type is `unknown`, all findings are marked `optional`, preserving standard policy actions without modification.

### Utility Assessment
The API returns a utility assessment block:
- `basis`: `"task_aware"` if the task was identified; `"type_only"` if `unknown`.
- `may_change_result`:
  - `"low"`: If all altered findings were `unnecessary`.
  - `"possible"`: If any altered finding was `optional`.
  - `"high"`: If any `required` finding was altered or suppressed.

---

## 3. Role-Based Placeholders (`engine/veilguard_engine/sanitizer/core.py`)

When pseudonymizing `PERSON` entities, VeilGuard replaces generic `[PERSON_1]` tags with semantically meaningful role placeholders based on preceding context tokens.

### Role Extraction Rules
- Scans up to 3 tokens immediately preceding the entity start offset for role nouns.
- Supported role mapping:
  - `customer` → `CUSTOMER`
  - `client` → `CLIENT`
  - `patient` → `PATIENT`
  - `employee`, `staff` → `EMPLOYEE`
  - `applicant`, `candidate` → `CANDIDATE`
  - `student` → `STUDENT`
  - `user` → `USER`
  - `borrower` → `BORROWER`
  - `tenant` → `TENANT`
  - `member` → `MEMBER`
- If no role noun is found, defaults to `PERSON`.

### Consistency & Numbering Invariants
- **First Mention Fixation**: The first mention's resolved role label fixes the label for all subsequent mentions of that entity across the prompt and across multi-turn sessions.
- **Independent Indexing**: Numbering is scoped per label (`[CUSTOMER_1]`, `[CUSTOMER_2]`, `[EMPLOYEE_1]`).
- **Possessive Preservation**: The English possessive suffix (`'s`) is preserved outside the placeholder (e.g. `customer Rahul Sharma's account` → `customer [CUSTOMER_1]'s account`).

---

## 4. Quasi-Identifiers & Re-Identification Scoring (`engine/veilguard_engine/reid/`)

Quasi-identifiers are pieces of information that do not identify a person individually, but when combined can uniquely single them out (e.g., age + role + company + location + sensitive event).

### Quasi-Identifier Entity Types

| Entity Type | Description | Source / Technique |
|:---|:---|:---|
| `QUASI_AGE` | Specific ages or age expressions ("34-year-old", "age 42") | Regex patterns |
| `QUASI_ROLE` | Job titles and executive roles ("HR manager", "VP") | `data/roles.txt` (65 roles) |
| `QUASI_ORG` | Organization and employer names | spaCy NER (`ORG`) + company suffix cues |
| `QUASI_LOCATION` | Specific city, region, or branch office | spaCy NER (`GPE`, `LOC`) |
| `QUASI_EVENT` | Sensitive personal life events ("maternity leave", "divorce") | `data/sensitive_events.txt` (48 events) |
| `QUASI_GENDER` | Gendered pronouns ("he", "she", "her") | Low weight; never altered |

Quasi-identifiers **never trigger policy actions on their own**. They are evaluated collectively.

### Noisy-OR Combination Model
The total re-identification score is computed as:
$$S = 1 - \prod_{t \in T} (1 - w_t)$$
where $T$ is the set of **distinct** quasi-identifier types present in the text, and $w_t$ are the type weights from `reid/weights.yaml`:

| Type | Weight ($w$) |
|:---|:---|
| `QUASI_ORG` | 0.35 |
| `QUASI_EVENT` | 0.30 |
| `QUASI_AGE` | 0.25 |
| `QUASI_LOCATION` | 0.25 |
| `QUASI_ROLE` | 0.20 |
| `QUASI_GENDER` | 0.05 |

- **Thresholds**: Score $< 0.5 \implies \text{low}$; $0.5 \le S < 0.7 \implies \text{medium}$; $S \ge 0.7 \implies \text{high}$.

> [!CAUTION]
> **Heuristic Caveat**: These weights are expert-designed heuristic parameters, tuned on the development split. The score $S$ represents a relative risk index, **NOT** an empirical or mathematical probability that a specific individual will be re-identified in practice.

### ReidReducer Algorithm
When the re-identification level is `high`, policy rules invoke `reduce_reid`:
1. Loop while $S \ge 0.50$ (target risk threshold):
2. Select the next candidate quasi finding to reduce:
   - Prioritize by necessity: `unnecessary` first, then `optional`. (Never reduce `required` details unless unavoidable).
   - Break ties by type weight descending.
3. Apply generalization:
   - `QUASI_AGE` → Decade generalization (e.g., "34-year-old" → "30s").
   - `QUASI_ORG` → `[COMPANY_n]`
   - `QUASI_LOCATION` → `[CITY_n]`
   - `QUASI_EVENT` → Generic event category (e.g., "personal leave" or `[EVENT_n]`).
   - `QUASI_ROLE` → `[ROLE_n]`
   - `QUASI_GENDER` is **never modified**.
4. Recompute score after each reduction. Once $S < 0.50$, the reducer terminates immediately, preserving all remaining details to maximize semantic utility.

---

## 5. Medical Term Detection (`engine/veilguard_engine/detectors/medical.py`)

- **Lexicon**: `data/medical_terms.txt` contains 252 curated medical terms covering health conditions, treatments, mental health, reproductive health, and common generic pharmaceuticals.
- **Detection**: Whole-word, case-insensitive string matching producing entity types `MEDICAL_CONDITION`, `MEDICATION`, and `MEDICAL_PROCEDURE` under category `MEDICAL`.
- **Policy (`HEALTH_WITH_IDENTITY`)**:
  - A medical term appearing alone in text is **allowed** (general medical discussion or research is not personal data).
  - When a medical term appears alongside direct identity (`PERSON`, contact information, or government ID) OR a `high` re-identification risk, the rule fires:
    - **Identity is pseudonymized or removed.**
    - **The medical term is preserved** (`action: keep`), ensuring the AI can still analyze or respond to the health inquiry.
