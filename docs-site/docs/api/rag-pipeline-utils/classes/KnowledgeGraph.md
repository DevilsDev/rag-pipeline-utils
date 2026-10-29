---
mdx:
  format: md
---

# Class: KnowledgeGraph

In-memory knowledge graph with entities and relationships.

Stores typed entities and directed relationships between them,
supporting traversal, pattern-based querying, and adjacency lookups.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new KnowledgeGraph(options?): KnowledgeGraph;
```

#### Parameters

| Parameter  | Type  | Description                 |
| ---------- | ----- | --------------------------- |
| `options?` | `any` | Graph configuration options |

#### Returns

`KnowledgeGraph`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                            | Type                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| <a id="property-adjacency"></a> `adjacency`         | `Map`\<`string`, `Set`\<`string`\>\>                                                                              |
| <a id="property-entities"></a> `entities`           | `Map`\<`string`, \{ `id`: `string`; `labels`: `string`[]; `properties`: `any`; `type`: `string`; \}\>             |
| <a id="property-options"></a> `options`             | `any`                                                                                                             |
| <a id="property-relationships"></a> `relationships` | `Map`\<`string`, \{ `from`: `string`; `id`: `string`; `properties`: `any`; `to`: `string`; `type`: `string`; \}\> |

## Methods

### addEntity()

```ts
addEntity(
   id,
   type,
   properties?
): object;
```

Add an entity to the graph.

#### Parameters

| Parameter     | Type     | Description                                |
| ------------- | -------- | ------------------------------------------ |
| `id`          | `string` | Unique entity identifier                   |
| `type`        | `string` | Entity type (e.g. 'person', 'date', 'url') |
| `properties?` | `any`    | Arbitrary key-value properties             |

#### Returns

`object`

##### id

```ts
id: string;
```

##### labels

```ts
labels: string[];
```

##### properties

```ts
properties: any;
```

##### type

```ts
type: string;
```

---

### addRelationship()

```ts
addRelationship(
   fromId,
   toId,
   type,
   properties?
): object;
```

Add a directed relationship between two entities.

#### Parameters

| Parameter     | Type     | Description                                        |
| ------------- | -------- | -------------------------------------------------- |
| `fromId`      | `string` | Source entity ID                                   |
| `toId`        | `string` | Target entity ID                                   |
| `type`        | `string` | Relationship type (e.g. 'co-occurs', 'references') |
| `properties?` | `any`    | Arbitrary key-value properties                     |

#### Returns

`object`

##### from

```ts
from: string;
```

##### id

```ts
id: string;
```

##### properties

```ts
properties: any;
```

##### to

```ts
to: string;
```

##### type

```ts
type: string;
```

#### Throws

If either entity does not exist

---

### clear()

```ts
clear(): void;
```

Clear all graph data.

#### Returns

`void`

---

### getEntity()

```ts
getEntity(id): object;
```

Retrieve an entity by ID.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `id`      | `string` | Entity ID   |

#### Returns

`object`

##### id

```ts
id: string;
```

##### labels

```ts
labels: string[];
```

##### properties

```ts
properties: any;
```

##### type

```ts
type: string;
```

---

### getRelationships()

```ts
getRelationships(entityId, options?): object[];
```

Get relationships for an entity, optionally filtered.

#### Parameters

| Parameter            | Type                                                                             | Description                 |
| -------------------- | -------------------------------------------------------------------------------- | --------------------------- |
| `entityId`           | `string`                                                                         | Entity ID                   |
| `options?`           | \{ `direction?`: `"outgoing"` \| `"incoming"` \| `"both"`; `type?`: `string`; \} | Filter options              |
| `options.direction?` | `"outgoing"` \| `"incoming"` \| `"both"`                                         | Direction filter            |
| `options.type?`      | `string`                                                                         | Filter by relationship type |

#### Returns

`object`[]

---

### getStats()

```ts
getStats(): object;
```

Return basic graph statistics.

#### Returns

`object`

##### entityCount

```ts
entityCount: number;
```

##### relationshipCount

```ts
relationshipCount: number;
```

---

### query()

```ts
query(pattern): object;
```

Query the graph by pattern matching.

#### Parameters

| Parameter                   | Type                                                                                | Description                        |
| --------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| `pattern`                   | \{ `entityType?`: `string`; `properties?`: `any`; `relationshipType?`: `string`; \} | Query pattern                      |
| `pattern.entityType?`       | `string`                                                                            | Filter entities by type            |
| `pattern.properties?`       | `any`                                                                               | Filter by property key-value pairs |
| `pattern.relationshipType?` | `string`                                                                            | Filter relationships by type       |

#### Returns

`object`

##### entities

```ts
entities: any[];
```

##### relationships

```ts
relationships: any[];
```

---

### traverse()

```ts
traverse(startId, depth?): object;
```

BFS traversal from startId up to a given depth.

#### Parameters

| Parameter | Type     | Description             |
| --------- | -------- | ----------------------- |
| `startId` | `string` | Starting entity ID      |
| `depth?`  | `number` | Maximum traversal depth |

#### Returns

`object`

##### entities

```ts
entities: any[];
```

##### paths

```ts
paths: string[][];
```

##### relationships

```ts
relationships: any[];
```
