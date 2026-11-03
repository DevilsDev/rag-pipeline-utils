---
mdx:
  format: md
---

# Function: createMastraGuardrails()

```ts
function createMastraGuardrails(options?): any;
```

Create a Mastra processor with this library's guardrails: prompt-injection
detection on the user's message (input) and PII redaction of the answer
(output). A flagged message calls Mastra's `abort()`, which stops the run
with a tripwire.

## Parameters

| Parameter              | Type                                                                                                                                        | Description                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `options?`             | \{ `id?`: `string`; `injection?`: `any`; `pii?`: `false` \| `"redact"` \| `"block"`; `piiPatterns?`: \{ \[`x`: `string`\]: `RegExp`; \}; \} | -                                                      |
| `options.id?`          | `string`                                                                                                                                    | -                                                      |
| `options.injection?`   | `any`                                                                                                                                       | Check the last user message; PreRetrievalGuard options |
| `options.pii?`         | `false` \| `"redact"` \| `"block"`                                                                                                          | Redact PII in the answer, or abort the run             |
| `options.piiPatterns?` | \{ \[`x`: `string`\]: `RegExp`; \}                                                                                                          | Extra PII patterns by name                             |

## Returns

`any`

A Mastra processor

## Example

```ts
const agent = new Agent({
  ...,
  inputProcessors: [guardrails],
  outputProcessors: [guardrails],
});
const guardrails = createMastraGuardrails({ injection: true, pii: "redact" });
```
