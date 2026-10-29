---
mdx:
  format: md
---

# Function: loadConfig()

```ts
function loadConfig(location?): object;
```

Load and validate .ragrc.json.

## Parameters

| Parameter   | Type     | Description                                                                                 |
| ----------- | -------- | ------------------------------------------------------------------------------------------- |
| `location?` | `string` | A directory containing .ragrc.json, or the path of a config file (any name ending in .json) |

## Returns

`object`

Normalized configuration
