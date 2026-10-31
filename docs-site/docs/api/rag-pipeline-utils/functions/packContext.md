---
mdx:
  format: md
---

# Function: packContext()

```ts
function packContext(documents, options?): object;
```

Fit documents into a token budget.

The budget covers the documents and the per-document wrapper the built-in
connectors add (`<document index="n">`). The system prompt, the
instructions around the documents and the question come on top.

## Parameters

| Parameter              | Type                                                                                       | Description                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `documents`            | (`string` \| `object`)[]                                                                   | Ranked documents, best first                                 |
| `options?`             | \{ `countTokens?`: (`text`) => `number`; `maxTokens`: `number`; `truncate?`: `boolean`; \} | -                                                            |
| `options.countTokens?` | (`text`) => `number`                                                                       | Token counter (default: about four characters per token)     |
| `options.maxTokens`    | `number`                                                                                   | Token budget for the documents                               |
| `options.truncate?`    | `boolean`                                                                                  | Cut the top document to fit when it alone exceeds the budget |

## Returns

`object`

### documents

```ts
documents: (string | object)[];
```

### dropped

```ts
dropped: (string | number)[];
```

### kept

```ts
kept: (string | number)[];
```

### maxTokens

```ts
maxTokens: number;
```

### tokens

```ts
tokens: number;
```

### truncated

```ts
truncated: (string | number)[];
```

## Example

```ts
const { documents, tokens, dropped } = packContext(results, {
  maxTokens: 2000,
});
```
