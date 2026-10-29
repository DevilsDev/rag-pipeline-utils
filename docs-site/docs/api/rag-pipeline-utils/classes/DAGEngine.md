---
mdx:
  format: md
---

# Class: DAGEngine

The DAG class under its older name.

## Constructors

### Constructor

```ts
new DAGEngine(): DAG;
```

#### Returns

`DAG`

## Properties

| Property                                          | Type                  |
| ------------------------------------------------- | --------------------- |
| <a id="property-checkpoints"></a> `checkpoints`   | `Map`\<`any`, `any`\> |
| <a id="property-errorcontext"></a> `errorContext` | `ErrorContext`        |
| <a id="property-nodes"></a> `nodes`               | `Map`\<`any`, `any`\> |
| <a id="property-scheduler"></a> `scheduler`       | `ExecutionScheduler`  |

## Methods

### addNode()

```ts
addNode(
   id,
   _fn,
   options?
): DAGNode;
```

Adds a node. A source node receives the seed; a node with one input
receives that node's result, and with several, an array of them.

#### Parameters

| Parameter  | Type     | Description    |
| ---------- | -------- | -------------- |
| `id`       | `string` | Unique node id |
| `_fn`      | `any`    | -              |
| `options?` | `any`    | -              |

#### Returns

`DAGNode`

The node; set `optional` or `retry` on it to change how failures are handled

---

### buildAdjacencyList()

```ts
buildAdjacencyList(): Map<any, any>;
```

Build adjacency list for the DAG (legacy method for compatibility)

#### Returns

`Map`\<`any`, `any`\>

- Adjacency list mapping node IDs to arrays of dependent node IDs

---

### clearCheckpoint()

```ts
clearCheckpoint(checkpointId): void;
```

Clear execution checkpoint

#### Parameters

| Parameter      | Type     | Description                  |
| -------------- | -------- | ---------------------------- |
| `checkpointId` | `string` | Unique checkpoint identifier |

#### Returns

`void`

---

### connect()

```ts
connect(fromId, toId): void;
```

Adds an edge: `toId` runs after `fromId` and receives its result.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `fromId`  | `string` | -           |
| `toId`    | `string` | -           |

#### Returns

`void`

---

### execute()

```ts
execute(seedOrOptions, _options?): Promise<any>;
```

Executes the DAG with optional seed data and configuration

#### Parameters

| Parameter       | Type  | Description                                 |
| --------------- | ----- | ------------------------------------------- |
| `seedOrOptions` | `any` | Seed data or options object                 |
| `_options?`     | `any` | Additional options (if first param is seed) |

#### Returns

`Promise`\<`any`\>

- Execution results

---

### executeNode()

```ts
executeNode(node, context): Promise<any>;
```

Execute a single node with input data

#### Parameters

| Parameter | Type      | Description       |
| --------- | --------- | ----------------- |
| `node`    | `DAGNode` | Node to execute   |
| `context` | `any`     | Execution context |

#### Returns

`Promise`\<`any`\>

Node execution result

---

### getDownstreamNodes()

```ts
getDownstreamNodes(node): DAGNode[];
```

Get all downstream nodes that depend on the given node

#### Parameters

| Parameter | Type      | Description                              |
| --------- | --------- | ---------------------------------------- |
| `node`    | `DAGNode` | Node to find downstream dependencies for |

#### Returns

`DAGNode`[]

Array of downstream nodes

---

### listCheckpoints()

```ts
listCheckpoints(): any[];
```

List all available checkpoints

#### Returns

`any`[]

- Array of checkpoint IDs with metadata

---

### loadCheckpoint()

```ts
loadCheckpoint(checkpointId): any;
```

Load execution checkpoint

#### Parameters

| Parameter      | Type     | Description                  |
| -------------- | -------- | ---------------------------- |
| `checkpointId` | `string` | Unique checkpoint identifier |

#### Returns

`any`

- Saved execution state or null if not found

---

### resume()

```ts
resume(checkpointData?): Promise<Map<any, any>>;
```

Resume execution from checkpoint data

#### Parameters

| Parameter         | Type  | Description                    |
| ----------------- | ----- | ------------------------------ |
| `checkpointData?` | `any` | Checkpoint data to resume from |

#### Returns

`Promise`\<`Map`\<`any`, `any`\>\>

- Results Map from resumed execution

---

### saveCheckpoint()

```ts
saveCheckpoint(checkpointId, state): void;
```

Save execution checkpoint

#### Parameters

| Parameter      | Type     | Description                  |
| -------------- | -------- | ---------------------------- |
| `checkpointId` | `string` | Unique checkpoint identifier |
| `state`        | `any`    | Execution state to save      |

#### Returns

`void`

---

### topoSort()

```ts
topoSort(): DAGNode[];
```

Performs topological sort with cycle detection

#### Returns

`DAGNode`[]

Topologically sorted nodes

#### Throws

If cycles are detected

---

### validate()

```ts
validate(): boolean;
```

Validates the DAG structure

#### Returns

`boolean`

- True if valid

#### Throws

- If validation fails

---

### validateTopology()

```ts
validateTopology(_options?): any[];
```

Validate topology with advanced options

#### Parameters

| Parameter   | Type  | Description        |
| ----------- | ----- | ------------------ |
| `_options?` | `any` | Validation options |

#### Returns

`any`[]

- Array of warnings (empty if no issues)
