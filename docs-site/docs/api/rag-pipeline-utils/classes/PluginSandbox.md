---
mdx:
  format: md
---

# ~~Class: PluginSandbox~~

## Deprecated

Experimental (simulated or incomplete). Import PluginSandbox from "@devilsdev/rag-pipeline-utils/experimental"; it will be removed from the main entry in the next major release.

## Constructors

### Constructor

```ts
new PluginSandbox(options?): PluginSandbox;
```

#### Parameters

| Parameter              | Type                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `options?`             | \{ \[`key`: `string`\]: `any`; `memoryLimit?`: `number`; `permissions?`: `string`[]; `timeout?`: `number`; \} |
| `options.memoryLimit?` | `number`                                                                                                      |
| `options.permissions?` | `string`[]                                                                                                    |
| `options.timeout?`     | `number`                                                                                                      |

#### Returns

`PluginSandbox`

## Methods

### ~~execute()~~

```ts
execute(code, context?): Promise<any>;
```

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `code`     | `string` |
| `context?` | `any`    |

#### Returns

`Promise`\<`any`\>
