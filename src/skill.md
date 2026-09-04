## Extension: Simple Assertions

Provides the `assertions-table` block for writing test assertions against HTTP responses. Insert with `/assertions` slash command.

> **Not currently enforced as singleton** by the app, but one `assertions-table` per section/request is still the recommended shape for readability — add more rows to the existing table rather than inserting a second `assertions-table` for the same request.
>
> **Operator caveat — `contains` / `not-contains`:** these only match against **string** and **array** fields. They do not search inside a plain **object** field (e.g. checking whether `body.user` "contains" something) — that's expected behavior, not a bug. Pick a more specific field path (e.g. `body.user.email`) when the target is an object.

### assertions-table — Response Assertions

```yaml
---
type: assertions-table
attrs:
  uid: "uid"
content:
  - type: table
    rows:
      - attrs: { disabled: false }
        row: ["Status is 200", "status", "equals", "200"]
      - attrs: { disabled: false }
        row: ["Has user id", "body.id", "exists", null]
      - attrs: { disabled: false }
        row: ["Name is John", "body.name", "equals", "John"]
      - attrs: { disabled: false }
        row: ["Has items", "body.items", "contains", "product"]
      - attrs: { disabled: true }
        row: ["Response time", "responseTime", "less-than", "500"]
---
```

Row format: `[description, field, operator, expected-value]`

### Field Paths

| Field | Description |
|-------|-------------|
| `status` | HTTP status code (e.g. `200`, `404`) |
| `body` | Full response body |
| `body.field` | JSONPath into response body |
| `body.nested.field` | Nested JSONPath |
| `headers.content-type` | Response header value |
| `requestHeader.name` | Header actually sent with the request (e.g. `requestHeader.Authorization`) |
| `responseTime` | Response time in milliseconds |

### Operators

| Operator | Description | Example expected |
|----------|-------------|-----------------|
| `equals` | Exact match | `"200"`, `"John"` |
| `not-equals` | Does not match | `"error"` |
| `contains` | String contains | `"success"` |
| `not-contains` | Does not contain | `"error"` |
| `exists` | Field is present (non-null) | `null` (leave null) |
| `not-exists` | Field is absent or null | `null` |
| `matches` | Regex match | `"^[0-9]+$"` |
| `greater-than` | Numeric greater than | `"0"` |
| `less-than` | Numeric less than | `"1000"` |
| `greater-equal` | Numeric greater than or equal | `"200"` |
| `less-equal` | Numeric less than or equal | `"500"` |
| `starts-with` | String starts with | `"Bearer"` |
| `ends-with` | String ends with | `".json"` |
| `is-empty` | Value is empty string, null, or empty array | `null` |
| `not-empty` | Value is not empty | `null` |
| `is-truthy` | Value is truthy | `null` |
| `is-falsy` | Value is falsy | `null` |
| `type-is` | Typeof check | `"string"`, `"number"`, `"object"` |

### Common Assertion Patterns

```yaml
# Check status code
row: ["Success response", "status", "equals", "200"]

# Check a body field exists
row: ["Has ID", "body.id", "exists", null]

# Check a body field value
row: ["Correct name", "body.name", "equals", "John Doe"]

# Check response time under 500ms
row: ["Fast response", "responseTime", "less-than", "500"]

# Check header value
row: ["JSON content type", "headers.content-type", "contains", "application/json"]

# Check nested field
row: ["Has email", "body.user.email", "exists", null]

# Check field does not exist
row: ["No error field", "body.error", "not-exists", null]

# Check string starts with
row: ["Bearer token", "headers.authorization", "starts-with", "Bearer"]

# Check a header actually sent with the request
row: ["Auth header sent", "requestHeader.Authorization", "exists", null]

# Check value type
row: ["ID is number", "body.id", "type-is", "number"]
```
