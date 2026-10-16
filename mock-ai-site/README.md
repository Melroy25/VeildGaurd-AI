# Mock AI Chat Site

Deterministic testbed application designed for verifying privacy firewall interception mechanics. Built exclusively using Node's standard `http` module with no external framework dependencies.

## Network & Binding
- **Host:** `127.0.0.1` (strict loopback)
- **Port:** `4310`

## Endpoints

### 1. `POST /api/chat`
- Accepts JSON: `{ "message": "string" }`
- Stores messages in an **in-memory buffer** (no persistence to disk).
- Returns JSON: `{ "reply": "Mock AI received N characters.", "receivedCount": N }`

### 2. `GET /__test/received` (Test-Only)
- Returns array of messages stored in memory during the current test session:
  ```json
  {
    "count": 1,
    "messages": [
      {
        "message": "Sample prompt",
        "timestamp": "2026-10-16T14:00:00.000Z",
        "transport": "fetch"
      }
    ]
  }
  ```

### 3. `POST /__test/reset` (Test-Only)
- Clears the in-memory array. Returns `{ "status": "reset", "count": 0 }`.

## Query Parameter Configurations

The client interface behavior can be modified dynamically via query parameters:

| Parameter | Options | Default | Description |
| :--- | :--- | :--- | :--- |
| `composer` | `textarea`, `contenteditable` | `textarea` | Renders standard `<textarea>` or real `contenteditable="true"` `<div>`. |
| `wiring` | `form`, `click` | `form` | In `form`, elements are wrapped in `<form id="chat-form">` firing `submit`. In `click`, `#send-btn` is `type="button"`. |
| `transport` | `fetch`, `xhr` | `fetch` | Controls whether client-side transmission uses `window.fetch()` or `XMLHttpRequest`. |

## Additional Controls
- **Enter key:** Pressing Enter (without Shift, not during IME composition) sends message directly.
- **`#send-programmatic`:** Test button that reads composer and sends message directly without triggering form submit or `#send-btn` click, used for Part B MAIN-world backstop testing.
