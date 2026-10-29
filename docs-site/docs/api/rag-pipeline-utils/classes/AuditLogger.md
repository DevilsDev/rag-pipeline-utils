---
mdx:
  format: md
---

# Class: AuditLogger

## Constructors

### Constructor

```ts
new AuditLogger(options?): AuditLogger;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | `any` |

#### Returns

`AuditLogger`

## Methods

### logAuthentication()

```ts
logAuthentication(event): Promise<void>;
```

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `event`   | `any` |

#### Returns

`Promise`\<`void`\>

---

### logDataAccess()

```ts
logDataAccess(event): Promise<void>;
```

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `event`   | `any` |

#### Returns

`Promise`\<`void`\>

---

### logDataModification()

```ts
logDataModification(event): Promise<void>;
```

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `event`   | `any` |

#### Returns

`Promise`\<`void`\>
