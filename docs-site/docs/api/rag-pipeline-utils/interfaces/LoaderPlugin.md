---
mdx:
  format: md
---

# Interface: LoaderPlugin

A loader. To register it with pluginRegistry it needs `metadata: { name, version, type: "loader" }`.

## Methods

### load()

```ts
load(source?, options?): unknown;
```

The pipeline calls `load()` with no arguments at the start of each run and ignores the result.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `source?`  | `string` |
| `options?` | `any`    |

#### Returns

`unknown`
