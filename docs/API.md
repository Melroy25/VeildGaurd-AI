# VeilGuard AI: Engine API Reference

> **Privacy Invariant (Rule 7):** The engine never returns raw matched text. All `reason` fields use generic templates that identify entity *type* and *count* only. No prompt content is written to logs, responses, or storage.

---

## Base URL

```
http://127.0.0.1:8765
```

The engine binds **strictly** to loopback (`127.0.0.1`). External network requests will be refused at the OS level. Any request with a non-loopback `Host` header is rejected with `403 Forbidden`.

---

## Authentication

All endpoints except `GET /health` require Bearer token authentication.

```
Authorization: Bearer <token>
```

**Token discovery order:**
1. `VEILGUARD_TOKEN` environment variable (overrides file)
2. `.veilguard/token` file in the project root (auto-generated on first startup, gitignored)

Missing or invalid tokens receive `401 Unauthorized`.

---

## Origin Enforcement

Requests must originate from a recognized VeilGuard context. The engine rejects requests with unrecognized `Origin` headers with `403 Forbidden`.

**Allowed Origins:**
- `chrome-extension://<extension-id>` (any Chrome extension origin)
- Requests with no `Origin` header (e.g., local `curl` / test clients)

---

## Endpoints

### `GET /health`

Returns engine liveness status. No authentication required.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "engine": "veilguard",
  "version": "0.1.0"
}
```

---

### `POST /scan`

Scans a text submission for privacy-sensitive entities.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <token>
Origin: chrome-extension://<extension-id>   (or omitted for local clients)
```

**Request Body (`ScanRequest`):**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `text` | `string` | Yes | The text to scan. Maximum 50,000 characters. |
| `source` | `string` | No | Identifier for the submission source (e.g., `"chatgpt"`, `"claude"`). Defaults to `"unknown"`. Maximum 100 characters. |

**Example Request:**
```json
{
  "text": "Please review patient Rahul Sharma, Aadhaar 5678 9012 3456, PAN ABCPE1234F.",
  "source": "chatgpt"
}
```

---

**Response Body (`ScanResponse`):**

| Field | Type | Description |
| :--- | :--- | :--- |
| `offset_unit` | `string` | Always `"utf16"`. Character indexing unit for all offsets in response. |
| `findings` | `Finding[]` | Ordered list of detected sensitive entities (non-overlapping). |
| `stats` | `ScanStats` | Summary metadata about the scan. |

**`Finding` Object:**

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique finding identifier within the response (e.g., `"f1"`, `"f2"`). |
| `category` | `string` | High-level risk category (`PII`, `FINANCIAL`, `GOVERNMENT_ID`, `SECRET`, `CONFIDENTIAL`). |
| `entity_type` | `string` | Specific entity type (e.g., `IN_AADHAAR`, `IN_PAN`, `PERSON`, `AWS_ACCESS_KEY`). |
| `start` | `integer` | Start offset in input text (indexed by UTF-16 code units for JavaScript string compatibility). |
| `end` | `integer` | Exclusive end offset in input text (indexed by UTF-16 code units). |
| `score` | `number` | Confidence score in range `[0.0, 1.0]`. |
| `detector` | `string` | Name of the detector module that identified the finding. |
| `rule_id` | `string` | Machine-readable rule identifier. |
| `validated` | `boolean | null` | Checksum verification outcome if applicable. |
| `reason` | `string` | Generic human-readable explanation using entity type and count only — **never contains matched text**. |
| `also_detected_as` | `string[]` | Other entity types that overlapped with this finding and were de-prioritized by overlap resolution. |

**Example Response:**
```json
{
  "offset_unit": "utf16",
  "findings": [
    {
      "id": "f1",
      "category": "PII",
      "entity_type": "PERSON",
      "start": 23,
      "end": 35,
      "score": 0.85,
      "detector": "presidio",
      "rule_id": "presidio.person",
      "validated": null,
      "reason": "Identified potential PERSON via Presidio statistical/pattern analyzer.",
      "also_detected_as": []
    }
  ],
  "stats": {
    "text_length": 118,
    "latency_ms": 42.7,
    "detectors": ["india_detector", "secrets_detector", "watchlist_detector", "presidio"],
    "spacy_model": "en_core_web_sm"
  }
}
```

---

### `POST /analyze`

Performs full privacy analysis, evaluates declarative YAML policy rules, and produces a sanitized prompt version with consistent type-based placeholders, masks, or removals.

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer <token>
Origin: chrome-extension://<extension-id>   (or omitted for local clients)
```

**Request Body (`AnalyzeRequest`):**

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `text` | `string` | Yes | The prompt or document text to analyze. Max 200,000 characters. |
| `source` | `string` | No | `"prompt"` (default) or `"document"`. |
| `destination` | `string` | No | Destination hostname string (e.g. `"127.0.0.1"`, `"chatgpt.com"`). Defaults to `"127.0.0.1"`. |
| `profile` | `string` | No | Policy profile name (`"company"`, `"personal"`, `"finance"`). Defaults to `"company"`. |
| `known_placeholders`| `array` | No | Optional seed list of `[{"entity_type": "...", "value": "...", "placeholder": "..."}]` for cross-turn chat session consistency. |

**Response Body (`AnalyzeResponse`):**

| Field | Type | Description |
| :--- | :--- | :--- |
| `offset_unit` | `string` | Always `"utf16"`. Offset unit for all finding and replacement coordinates. |
| `decision` | `string` | Strongest policy decision: `"allow"`, `"redact"`, `"require_approval"`, `"block"`. |
| `options` | `string[]` | Allowed user workflow choices: `["send_original"]`, `["send_sanitized", "edit", "cancel"]`, etc. |
| `summary` | `string` | Plain-language decision explanation without any sensitive content. |
| `applied_rules`| `AppliedRule[]` | Policy rules that matched and fired (`rule_id`, `reason`, `finding_ids`). |
| `findings` | `Finding[]` | Non-overlapping detected findings with UTF-16 offsets. |
| `sanitization` | `SanitizeResult | null` | Sanitized text and replacement mapping. `null` if decision is `"allow"`. |
| `notices` | `string[]` | Safety notices, always including `"Detection is not exhaustive. Review the text before sending."` |
| `stats` | `AnalyzeStats` | Execution statistics (latency, resolved trust tier, profile). |

**`SanitizeResult` Object:**

| Field | Type | Description |
| :--- | :--- | :--- |
| `sanitized_text` | `string` | Utility-preserving prompt with sensitive entities replaced by placeholders or masks. |
| `replacements` | `ReplacementItem[]` | Mapping of changes made. **Strictly contains offsets, actions, and placeholders; NEVER contains original sensitive values.** |
| `explanations` | `SanitizeExplanation[]` | Per-finding action explanations. |
| `utility` | `UtilityNotice` | `{ basis: "type_only", may_change_result: "possible" | "low", notes: [...] }`. |
| `verification` | `SanitizeVerification` | Post-sanitization re-scan verification proving 0 residual entities. |

---

### `GET /policy/profiles`

Returns all registered policy profiles and their rules for UI configuration.

**Request Headers:**
```
Authorization: Bearer <token>
```

**Response `200 OK`:**
```json
[
  {
    "profile": "company",
    "description": "Default corporate policy for employees using external AI tools",
    "rules": [
      {
        "rule_id": "BLOCK_SECRETS",
        "reason": "API keys, tokens, credentials and passwords must not be shared with external AI tools."
      }
    ]
  }
]
```

---

## Error Responses

| Status | Condition |
| :--- | :--- |
| `400 Bad Request` | Unknown policy profile requested. Generic error that **never echoes user input**. |
| `401 Unauthorized` | Missing or invalid `Authorization` header |
| `403 Forbidden` | Non-loopback `Host` header or disallowed `Origin` |
| `422 Unprocessable Content` | Request validation failure (field missing, text exceeds limit). Error detail does not echo submitted text. |


---

## Overlap Resolution

When multiple detectors produce overlapping spans, the engine retains the highest-priority finding and records the losers in `also_detected_as`. Priority tiers (highest first):

| Tier | Detectors / Conditions |
| :--- | :--- |
| 5 (highest) | `india` detector with `validated=true` (Aadhaar, PAN, GSTIN, IFSC, Bank Account with context) |
| 4 | `secrets` detector |
| 3 | `watchlist` detector |
| 2 | `india` detector with `validated=false` (IN_MOBILE, UPI_ID) |
| 1 (lowest) | `presidio` statistical / NER findings |

---

## Security Boundaries

| Boundary | Implementation |
| :--- | :--- |
| Network scope | Loopback-only (`127.0.0.1`); `TrustedHostMiddleware` rejects other `Host` values |
| Authentication | Bearer token, constant-time `secrets.compare_digest()` comparison |
| Origin enforcement | `OriginCheckMiddleware` rejects non-`chrome-extension://` and non-empty Origin headers |
| Input size limit | 50,000 characters maximum; enforced by Pydantic model constraint |
| No content logging | `SensitiveLogFilter` drops all `presidio-analyzer` DEBUG logs and "Context list is" messages |
| No content in errors | `sanitized_validation_exception_handler` strips field values from 422 error details |
| No content in storage | Engine writes no prompt text to disk, database, or telemetry |
