---
mdx:
  format: md
---

# Class: DAGEngine

## Constructors

### Constructor

```ts
new DAGEngine(options?): DAGEngine;
```

#### Parameters

| Parameter  | Type                                        |
| ---------- | ------------------------------------------- |
| `options?` | [`DAGOptions`](../interfaces/DAGOptions.md) |

#### Returns

`DAGEngine`

## Methods

### addNode()

```ts
addNode(
   id,
   fn,
   options?
): void;
```

#### Parameters

| Parameter  | Type                                               |
| ---------- | -------------------------------------------------- |
| `id`       | `string`                                           |
| `fn`       | (`input`) => `Promise`\<`any`\>                    |
| `options?` | `Partial`\<[`DAGNode`](../interfaces/DAGNode.md)\> |

#### Returns

`void`

---

### connect()

```ts
connect(fromId, toId): void;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `fromId`  | `string` |
| `toId`    | `string` |

#### Returns

`void`

---

### execute()

```ts
execute(seed?, options?): Promise<Map<string, any>>;
```

#### Parameters

| Parameter  | Type                                        |
| ---------- | ------------------------------------------- |
| `seed?`    | `any`                                       |
| `options?` | [`DAGOptions`](../interfaces/DAGOptions.md) |

#### Returns

`Promise`\<`Map`\<`string`, `any`\>\>

---

### validate()

```ts
validate(): void;
```

#### Returns

`void`
