---
mdx:
  format: md
---

# Interface: PluginRegistry

## Methods

### get()

```ts
get(type, name): any;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `type`    | `string` |
| `name`    | `string` |

#### Returns

`any`

---

### has()

```ts
has(type, name): boolean;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `type`    | `string` |
| `name`    | `string` |

#### Returns

`boolean`

---

### list()

```ts
list(type): any[];
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `type`    | `string` |

#### Returns

`any`[]

---

### register()

```ts
register(
   type,
   name,
   implementation,
   contract?
): void;
```

#### Parameters

| Parameter        | Type     |
| ---------------- | -------- |
| `type`           | `string` |
| `name`           | `string` |
| `implementation` | `any`    |
| `contract?`      | `any`    |

#### Returns

`void`
