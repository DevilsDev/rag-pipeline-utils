---
mdx:
  format: md
---

# Variable: pluginRegistry

```ts
const pluginRegistry: PluginRegistry;
```

The shared plugin registry: maps (type, name) to plugins, checking each
against its contract. Signed manifests are required when NODE_ENV is
production.
