---
mdx:
  format: md
---

# Variable: EventTypes

```ts
const EventTypes: object;
```

Event type names used by PipelineEventLogger. The logger also emits
'stage.end' and 'memory.warning', which have no entry here.

## Type Declaration

### PLUGIN_END

```ts
PLUGIN_END: string;
```

### PLUGIN_ERROR

```ts
PLUGIN_ERROR: string;
```

### PLUGIN_START

```ts
PLUGIN_START: string;
```

### STAGE_ERROR

```ts
STAGE_ERROR: string;
```

### STAGE_START

```ts
STAGE_START: string;
```
