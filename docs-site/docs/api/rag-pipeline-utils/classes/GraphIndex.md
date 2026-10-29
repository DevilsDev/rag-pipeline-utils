---
mdx:
  format: md
---

# Class: GraphIndex

Fast entity lookup index for the knowledge graph.

Maintains secondary indexes by type, name, and arbitrary properties
for efficient querying without full graph traversal.

## Constructors

### Constructor

```ts
new GraphIndex(): GraphIndex;
```

#### Returns

`GraphIndex`

## Properties

| Property                                      | Type                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| <a id="property-byname"></a> `byName`         | `Map`\<`string`, `string`\>                          |
| <a id="property-byproperty"></a> `byProperty` | `Map`\<`string`, `Map`\<`any`, `Set`\<`string`\>\>\> |
| <a id="property-bytype"></a> `byType`         | `Map`\<`string`, `Set`\<`string`\>\>                 |

## Methods

### clear()

```ts
clear(): void;
```

Clear all indexes.

#### Returns

`void`

---

### indexEntity()

```ts
indexEntity(entity): void;
```

Index an entity by type, name, and each of its properties.

#### Parameters

| Parameter           | Type                                                         | Description |
| ------------------- | ------------------------------------------------------------ | ----------- |
| `entity`            | \{ `id`: `string`; `properties`: `any`; `type`: `string`; \} | -           |
| `entity.id`         | `string`                                                     | -           |
| `entity.properties` | `any`                                                        | -           |
| `entity.type`       | `string`                                                     | -           |

#### Returns

`void`

---

### searchByName()

```ts
searchByName(query): string[];
```

Fuzzy search for entities whose name contains the query (case-insensitive).

Results are sorted by relevance: exact matches first, then partial matches.

#### Parameters

| Parameter | Type     | Description  |
| --------- | -------- | ------------ |
| `query`   | `string` | Search query |

#### Returns

`string`[]

Array of matching entity IDs

---

### searchByProperty()

```ts
searchByProperty(key, value): string[];
```

Return entity IDs matching a property key-value pair.

#### Parameters

| Parameter | Type     | Description    |
| --------- | -------- | -------------- |
| `key`     | `string` | Property key   |
| `value`   | `any`    | Property value |

#### Returns

`string`[]

Array of entity IDs

---

### searchByType()

```ts
searchByType(type): string[];
```

Return all entity IDs of a given type.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `type`    | `string` | Entity type |

#### Returns

`string`[]

Array of entity IDs
