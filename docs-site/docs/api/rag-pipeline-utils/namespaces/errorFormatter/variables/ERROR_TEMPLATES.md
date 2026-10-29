---
mdx:
  format: md
---

# Variable: ERROR_TEMPLATES

```ts
const ERROR_TEMPLATES: object;
```

Message, suggestion and documentation templates keyed by error code.
Placeholders such as {path} are filled from the context passed to
formatError. Codes without an entry fall back to UNKNOWN_ERROR.

## Index Signature

```ts
[key: string]: object
```
