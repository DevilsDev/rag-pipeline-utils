---
mdx:
  format: md
---

# Class: MCPServer

MCP server that registers RAG pipelines as callable MCP tools.

## Fires

MCPServer#tool_use

## Example

```ts
const server = MCPServer.fromPipeline(myPipeline, { name: "my_tool" });
const tools = server.getToolDefinitions();
const result = await server.handleToolUse("my_tool", { query: "What is X?" });
```

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new MCPServer(options?): MCPServer;
```

#### Parameters

| Parameter                    | Type                                                                                        | Description                         |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------- |
| `options?`                   | \{ `includeMetadata?`: `boolean`; `maxResponseLength?`: `number`; `toolOptions?`: `any`; \} | Server configuration                |
| `options.includeMetadata?`   | `boolean`                                                                                   | Include metadata in responses       |
| `options.maxResponseLength?` | `number`                                                                                    | Maximum response text length        |
| `options.toolOptions?`       | `any`                                                                                       | Options forwarded to MCPToolBuilder |

#### Returns

`MCPServer`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                        | Type                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| <a id="property-config"></a> `config`           | `any`                                                                                 |
| <a id="property-pipelines"></a> `pipelines`     | `Map`\<`string`, \{ `config`: `any`; `pipeline`: `any`; `toolDefinition`: `any`; \}\> |
| <a id="property-toolbuilder"></a> `toolBuilder` | [`MCPToolBuilder`](MCPToolBuilder.md)                                                 |

## Methods

### fromPipeline()

```ts
static fromPipeline(pipeline, options?): MCPServer;
```

Convenience factory: create an MCPServer with a single pipeline registered.

#### Parameters

| Parameter         | Type                                       | Description                           |
| ----------------- | ------------------------------------------ | ------------------------------------- |
| `pipeline`        | `any`                                      | Pipeline instance with a `run` method |
| `options?`        | \{ `config?`: `any`; `name?`: `string`; \} | Server and registration options       |
| `options.config?` | `any`                                      | Pipeline-specific configuration       |
| `options.name?`   | `string`                                   | Tool name for the pipeline            |

#### Returns

`MCPServer`

Configured server instance

---

### getToolDefinitions()

```ts
getToolDefinitions(): any[];
```

Return array of all registered tool definitions.
Each is a valid MCP tool schema.

#### Returns

`any`[]

Array of MCP tool definition objects

---

### handleToolUse()

```ts
handleToolUse(toolName, toolInput): Promise<any>;
```

Handle an MCP tool_use request by running the matching pipeline.

#### Parameters

| Parameter              | Type                                                                                                               | Description                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `toolName`             | `string`                                                                                                           | Name of the tool to invoke         |
| `toolInput`            | \{ `citations?`: `boolean`; `evaluate?`: `boolean`; `query`: `string`; `stream?`: `boolean`; `topK?`: `number`; \} | Tool input parameters              |
| `toolInput.citations?` | `boolean`                                                                                                          | Include source citations           |
| `toolInput.evaluate?`  | `boolean`                                                                                                          | Include quality evaluation metrics |
| `toolInput.query`      | `string`                                                                                                           | The search query (required)        |
| `toolInput.stream?`    | `boolean`                                                                                                          | Enable streaming response          |
| `toolInput.topK?`      | `number`                                                                                                           | Number of results to retrieve      |

#### Returns

`Promise`\<`any`\>

MCP-formatted response with type and text fields

#### Throws

If tool name is not registered or query is missing

---

### registerPipeline()

```ts
registerPipeline(
   name,
   pipeline,
   config?
): void;
```

Register a pipeline that can be called as an MCP tool.

#### Parameters

| Parameter  | Type     | Description                            |
| ---------- | -------- | -------------------------------------- |
| `name`     | `string` | Tool name used to invoke this pipeline |
| `pipeline` | `any`    | Pipeline instance with a `run` method  |
| `config?`  | `any`    | Pipeline-specific configuration        |

#### Returns

`void`
