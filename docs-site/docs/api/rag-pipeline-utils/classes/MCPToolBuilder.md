---
mdx:
  format: md
---

# Class: MCPToolBuilder

Builds MCP-compatible tool definitions from RAG pipeline configuration.

## Example

```ts
const builder = new MCPToolBuilder({ toolName: "my_rag_tool" });
const definition = builder.buildToolDefinition({
  capabilities: { stream: true },
});
```

## Constructors

### Constructor

```ts
new MCPToolBuilder(options?): MCPToolBuilder;
```

#### Parameters

| Parameter                  | Type                                                       | Description                            |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `options?`                 | \{ `toolDescription?`: `string`; `toolName?`: `string`; \} | Builder configuration                  |
| `options.toolDescription?` | `string`                                                   | Description for the generated MCP tool |
| `options.toolName?`        | `string`                                                   | Name for the generated MCP tool        |

#### Returns

`MCPToolBuilder`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### buildMultipleTools()

```ts
buildMultipleTools(pipelines): any[];
```

Build tool definitions for multiple named pipelines.

#### Parameters

| Parameter   | Type    | Description                   |
| ----------- | ------- | ----------------------------- |
| `pipelines` | `any`[] | Array of pipeline descriptors |

#### Returns

`any`[]

Array of MCP tool definitions

---

### buildToolDefinition()

```ts
buildToolDefinition(pipelineConfig?): any;
```

Generate an MCP-compatible tool definition from pipeline configuration.

#### Parameters

| Parameter                                | Type                                                                                                                       | Description                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `pipelineConfig?`                        | \{ `capabilities?`: \{ `citations?`: `boolean`; `evaluate?`: `boolean`; `maxTopK?`: `number`; `stream?`: `boolean`; \}; \} | Pipeline-specific configuration            |
| `pipelineConfig.capabilities?`           | \{ `citations?`: `boolean`; `evaluate?`: `boolean`; `maxTopK?`: `number`; `stream?`: `boolean`; \}                         | Pipeline capabilities to reflect in schema |
| `pipelineConfig.capabilities.citations?` | `boolean`                                                                                                                  | Whether citations are supported            |
| `pipelineConfig.capabilities.evaluate?`  | `boolean`                                                                                                                  | Whether evaluation is supported            |
| `pipelineConfig.capabilities.maxTopK?`   | `number`                                                                                                                   | Maximum allowed topK value                 |
| `pipelineConfig.capabilities.stream?`    | `boolean`                                                                                                                  | Whether streaming is supported             |

#### Returns

`any`

MCP tool definition with name, description, and input_schema
