---
mdx:
  format: md
---

# Class: TemplateRegistry

Registry of built-in and custom project templates.

## Example

```ts
const registry = new TemplateRegistry();
const templates = registry.list();
const template = registry.get("document-qa");
```

## Constructors

### Constructor

```ts
new TemplateRegistry(): TemplateRegistry;
```

#### Returns

`TemplateRegistry`

## Properties

| Property                                    | Type                     |
| ------------------------------------------- | ------------------------ |
| <a id="property-templates"></a> `templates` | `Map`\<`string`, `any`\> |

## Methods

### get()

```ts
get(templateKey): any;
```

Get a full template definition by key.

#### Parameters

| Parameter     | Type     | Description         |
| ------------- | -------- | ------------------- |
| `templateKey` | `string` | Template identifier |

#### Returns

`any`

Full template object, or null if not found

---

### has()

```ts
has(key): boolean;
```

Check if a template exists.

#### Parameters

| Parameter | Type     | Description         |
| --------- | -------- | ------------------- |
| `key`     | `string` | Template identifier |

#### Returns

`boolean`

Whether the template is registered

---

### list()

```ts
list(): object[];
```

List all available templates.

#### Returns

`object`[]

Summary of each template

---

### register()

```ts
register(key, template): void;
```

Register a custom template.

#### Parameters

| Parameter               | Type                                                                                                     | Description                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `key`                   | `string`                                                                                                 | Template identifier             |
| `template`              | \{ `config`: `any`; `dependencies`: `any`; `description`: `string`; `files`: `any`; `name`: `string`; \} | Template definition             |
| `template.config`       | `any`                                                                                                    | Pipeline configuration          |
| `template.dependencies` | `any`                                                                                                    | npm dependencies                |
| `template.description`  | `string`                                                                                                 | Short description               |
| `template.files`        | `any`                                                                                                    | Map of filename to file content |
| `template.name`         | `string`                                                                                                 | Display name                    |

#### Returns

`void`
