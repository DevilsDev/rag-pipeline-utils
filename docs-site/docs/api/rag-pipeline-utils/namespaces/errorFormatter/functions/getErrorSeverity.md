---
mdx:
  format: md
---

# Function: getErrorSeverity()

```ts
function getErrorSeverity(code): "critical" | "warning" | "error";
```

Severity for an error code: 'critical' for PIPELINE_CREATION_FAILED,
CONFIG_NOT_FOUND, FS_PERMISSION_DENIED and AUTH_INVALID_TOKEN, 'warning'
for the HOT_RELOAD_FAILED and HOT_RELOAD_STATE_ERROR codes, 'error' otherwise.

## Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `code`    | `string` | Error code  |

## Returns

`"critical"` \| `"warning"` \| `"error"`

Severity level
