---
mdx:
  format: md
---

# Interface: EnhancedError

An error created by [createError](../functions/createError.md) or [wrapError](../functions/wrapError.md).

## Extends

- `Error`

## Properties

| Property                                             | Type                        |
| ---------------------------------------------------- | --------------------------- |
| <a id="property-code"></a> `code`                    | `string`                    |
| <a id="property-context"></a> `context`              | `Record`\<`string`, `any`\> |
| <a id="property-documentation"></a> `documentation?` | `string`                    |
| <a id="property-originalerror"></a> `originalError?` | `Error`                     |
| <a id="property-suggestions"></a> `suggestions`      | `string`[]                  |
| <a id="property-timestamp"></a> `timestamp`          | `string`                    |
