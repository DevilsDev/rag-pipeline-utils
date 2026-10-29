---
mdx:
  format: md
---

# Class: ProjectScaffolder

Creates complete project directories from registered templates.

## Fires

ProjectScaffolder#created

## Example

```ts
const scaffolder = new ProjectScaffolder();
const result = scaffolder.create("document-qa", "/path/to/my-project");
console.log(result.files); // list of created files
```

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new ProjectScaffolder(options?): ProjectScaffolder;
```

#### Parameters

| Parameter                      | Type                                                              | Description                            |
| ------------------------------ | ----------------------------------------------------------------- | -------------------------------------- |
| `options?`                     | \{ `installDependencies?`: `boolean`; `overwrite?`: `boolean`; \} | Scaffolder configuration               |
| `options.installDependencies?` | `boolean`                                                         | Whether to auto-run npm install        |
| `options.overwrite?`           | `boolean`                                                         | Allow overwriting existing directories |

#### Returns

`ProjectScaffolder`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                  | Type                                      |
| ----------------------------------------- | ----------------------------------------- |
| <a id="property-config"></a> `config`     | `any`                                     |
| <a id="property-registry"></a> `registry` | [`TemplateRegistry`](TemplateRegistry.md) |

## Methods

### create()

```ts
create(
   templateKey,
   projectDir,
   options?
): object;
```

Create a new project from a template.

#### Parameters

| Parameter            | Type                           | Description                                   |
| -------------------- | ------------------------------ | --------------------------------------------- |
| `templateKey`        | `string`                       | Key of the template to use                    |
| `projectDir`         | `string`                       | Target directory for the new project          |
| `options?`           | \{ `overwrite?`: `boolean`; \} | Per-call overrides                            |
| `options.overwrite?` | `boolean`                      | Override the instance-level overwrite setting |

#### Returns

`object`

Creation result

##### files

```ts
files: string[];
```

##### projectDir

```ts
projectDir: string;
```

##### template

```ts
template: string;
```

#### Throws

If template is not found or directory already exists

---

### listTemplates()

```ts
listTemplates(): object[];
```

List all available templates.

#### Returns

`object`[]

Available templates
