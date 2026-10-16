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
| `findings` | `Finding[]` | Ordered list of detected sensitive entities (non-overlapping). |
| `stats` | `ScanStats` | Summary metadata about the scan. |

**`Finding` Object:**

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique finding identifier within the response (e.g., `"F001"`). |
| `category` | `string` | High-level risk category. One of: `IDENTITY`, `FINANCIAL`, `HEALTH`, `CREDENTIAL`, `CONTACT`, `WATCHLIST`, `OTHER`. |
| `entity_type` | `string` | Specific entity type (e.g., `IN_AADHAAR`, `IN_PAN`, `PERSON`, `AWS_ACCESS_KEY`). |
| `start` | `integer` | Zero-indexed start character offset in the submitted text. |
| `end` | `integer` | Zero-indexed exclusive end character offset (Python slice convention). |
| `score` | `number` | Confidence score in range `[0.0, 1.0]`. |
| `detector` | `string` | Name of the detector that produced the finding (e.g., `"india"`, `"presidio"`, `"secrets"`, `"watchlist"`). |
| `rule_id` | `string` | Machine-readable rule identifier (e.g., `"VG-IN-002"`, `"VG-SEC-001"`). |
| `validated` | `boolean` | `true` if the match was verified by a deterministic checksum (e.g., Verhoeff for Aadhaar, modular check for PAN/GSTIN). |
| `reason` | `string` | Generic human-readable explanation using entity type and count only — **never contains matched text**. |
| `also_detected_as` | `string[]` | Other entity types that overlapped with this finding and were de-prioritized by overlap resolution. Empty if no overlap. |

**`ScanStats` Object:**

| Field | Type | Description |
| :--- | :--- | :--- |
| `total_findings` | `integer` | Total number of non-overlapping findings returned. |
| `categories` | `object` | Mapping of `category → count` for all findings. |
| `validated_count` | `integer` | Number of findings where `validated = true`. |
| `scan_time_ms` | `number` | Wall-clock scan duration in milliseconds. |

**Example Response:**
```json
{
  "findings": [
    {
      "id": "F001",
      "category": "IDENTITY",
      "entity_type": "PERSON",
      "start": 23,
      "end": 35,
      "score": 0.85,
      "detector": "presidio",
      "rule_id": "VG-NER-001",
      "validated": false,
      "reason": "Detected 1 PERSON entity.",
      "also_detected_as": []
    },
    {
      "id": "F002",
      "category": "IDENTITY",
      "entity_type": "IN_AADHAAR",
      "start": 45,
      "end": 59,
      "score": 1.0,
      "detector": "india",
      "rule_id": "VG-IN-001",
      "validated": true,
      "reason": "Detected 1 IN_AADHAAR entity (checksum verified).",
      "also_detected_as": []
    }
  ],
  "stats": {
    "total_findings": 2,
    "categories": {
      "IDENTITY": 2
    },
    "validated_count": 1,
    "scan_time_ms": 42.7
  }
}
```

---

## Error Responses

| Status | Condition |
| :--- | :--- |
| `401 Unauthorized` | Missing or invalid `Authorization` header |
| `403 Forbidden` | Non-loopback `Host` header or disallowed `Origin` |
| `422 Unprocessable Content` | Request body validation failure (field missing, text exceeds limit). **Error detail does not echo submitted text.** |
| `429 Too Many Requests` | *(Reserved for future rate limiting)* |

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
