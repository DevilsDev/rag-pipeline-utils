---
mdx:
  format: md
---

# Class: StructuredLogger

Enhanced logger with correlation ID support and structured context

## Constructors

### Constructor

```ts
new StructuredLogger(baseLogger): StructuredLogger;
```

#### Parameters

| Parameter    | Type  |
| ------------ | ----- |
| `baseLogger` | `any` |

#### Returns

`StructuredLogger`

## Properties

| Property                                            | Type     |
| --------------------------------------------------- | -------- |
| <a id="property-context"></a> `context`             | `object` |
| <a id="property-correlationid"></a> `correlationId` | `any`    |
| <a id="property-logger"></a> `logger`               | `any`    |

## Methods

### audit()

```ts
audit(action, meta?): void;
```

Security audit logging with enhanced metadata

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `action`  | `any` |
| `meta?`   | \{ \} |

#### Returns

`void`

---

### child()

```ts
child(context?): StructuredLogger;
```

Create a child logger with correlation ID and context

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `context?` | \{ \} |

#### Returns

`StructuredLogger`

---

### debug()

```ts
debug(message, meta?): void;
```

Logs at debug level.

#### Parameters

| Parameter | Type     | Description                         |
| --------- | -------- | ----------------------------------- |
| `message` | `string` | -                                   |
| `meta?`   | `any`    | An object, Error or value to attach |

#### Returns

`void`

---

### error()

```ts
error(message, meta?): void;
```

Logs at error level.

#### Parameters

| Parameter | Type     | Description                         |
| --------- | -------- | ----------------------------------- |
| `message` | `string` | -                                   |
| `meta?`   | `any`    | An object, Error or value to attach |

#### Returns

`void`

---

### info()

```ts
info(message, meta?): void;
```

Logs at info level.

#### Parameters

| Parameter | Type     | Description                         |
| --------- | -------- | ----------------------------------- |
| `message` | `string` | -                                   |
| `meta?`   | `any`    | An object, Error or value to attach |

#### Returns

`void`

---

### performance()

```ts
performance(
   operation,
   duration,
   meta?
): void;
```

Performance logging with timing information

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `operation` | `any` |
| `duration`  | `any` |
| `meta?`     | \{ \} |

#### Returns

`void`

---

### setContext()

```ts
setContext(context): this;
```

Add persistent context to all log messages

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `context` | `any` |

#### Returns

`this`

---

### setCorrelationId()

```ts
setCorrelationId(correlationId): this;
```

Set correlation ID for distributed tracing

#### Parameters

| Parameter       | Type  |
| --------------- | ----- |
| `correlationId` | `any` |

#### Returns

`this`

---

### tenant()

```ts
tenant(
   tenantId,
   message,
   meta?
): void;
```

Tenant-specific logging for multi-tenant applications

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `tenantId` | `any` |
| `message`  | `any` |
| `meta?`    | \{ \} |

#### Returns

`void`

---

### warn()

```ts
warn(message, meta?): void;
```

Logs at warn level.

#### Parameters

| Parameter | Type     | Description                         |
| --------- | -------- | ----------------------------------- |
| `message` | `string` | -                                   |
| `meta?`   | `any`    | An object, Error or value to attach |

#### Returns

`void`
