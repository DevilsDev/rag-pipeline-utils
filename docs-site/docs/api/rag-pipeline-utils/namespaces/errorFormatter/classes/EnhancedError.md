---
mdx:
  format: md
---

# Class: EnhancedError

Error carrying a code, the context used to build its message, suggested
fixes and a documentation path, all taken from ERROR_TEMPLATES.

## Extends

- `Error`

## Constructors

### Constructor

```ts
new EnhancedError(
   code,
   context?,
   originalError?
): EnhancedError;
```

#### Parameters

| Parameter        | Type                            | Description                             |
| ---------------- | ------------------------------- | --------------------------------------- |
| `code`           | `string`                        | Error code, normally one of ERROR_CODES |
| `context?`       | \{ \[`x`: `string`\]: `any`; \} | Values for the template placeholders    |
| `originalError?` | `Error`                         | Underlying error, if any                |

#### Returns

`EnhancedError`

#### Overrides

`Error.constructor`

## Properties

| Property                                            | Type       |
| --------------------------------------------------- | ---------- |
| <a id="property-code"></a> `code`                   | `string`   |
| <a id="property-context"></a> `context`             | `object`   |
| <a id="property-documentation"></a> `documentation` | `string`   |
| <a id="property-originalerror"></a> `originalError` | `Error`    |
| <a id="property-suggestions"></a> `suggestions`     | `string`[] |
| <a id="property-timestamp"></a> `timestamp`         | `string`   |

## Methods

### getFormattedMessage()

```ts
getFormattedMessage(): string;
```

Format this error for display with formatErrorMessage's default options.

#### Returns

`string`

Multi-line message with code, suggestions and documentation link

---

### toJSON()

```ts
toJSON(): object;
```

Plain object for JSON logging, including the stack and the original
error's message and stack (or null).

#### Returns

`object`

##### code

```ts
code: string;
```

##### context

```ts
context: object;
```

###### Index Signature

```ts
[x: string]: any
```

##### documentation

```ts
documentation: string;
```

##### message

```ts
message: string;
```

##### name

```ts
name: string;
```

##### originalError

```ts
originalError: object;
```

###### originalError.message

```ts
message: string;
```

###### originalError.stack

```ts
stack: string;
```

##### stack

```ts
stack: string;
```

##### suggestions

```ts
suggestions: string[];
```

##### timestamp

```ts
timestamp: string;
```
