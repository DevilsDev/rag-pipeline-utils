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

| Parameter               | Type                                                                                                                                                                                            | Description                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `options?`              | \{ `id?`: `string`; `injection?`: `any`; `pii?`: `false` \| `"redact"` \| `"block"`; `piiBuiltIn?`: `boolean`; `piiDetectors?`: `any`[]; `piiPatterns?`: \{ \[`x`: `string`\]: `RegExp`; \}; \} | -                                                                             |
| `options.id?`           | `string`                                                                                                                                                                                        | -                                                                             |
| `options.injection?`    | `any`                                                                                                                                                                                           | Check the last user message; PreRetrievalGuard options, including `detectors` |
| `options.pii?`          | `false` \| `"redact"` \| `"block"`                                                                                                                                                              | Redact PII in the answer, or abort the run                                    |
| `options.piiBuiltIn?`   | `boolean`                                                                                                                                                                                       | false: use only piiDetectors, not the built-in PII patterns                   |
| `options.piiDetectors?` | `any`[]                                                                                                                                                                                         | PII detectors to run on the answer too; their matches are redacted            |
| `options.piiPatterns?`  | \{ \[`x`: `string`\]: `RegExp`; \}                                                                                                                                                              | Extra PII patterns by name                                                    |

## Returns

`any`

A Mastra processor. With detectors, its methods return promises (Mastra awaits them)

## Example

```ts
const agent = new Agent({
  ...,
  inputProcessors: [guardrails],
  outputProcessors: [guardrails],
});
const guardrails = createMastraGuardrails({ injection: true, pii: "redact" });
```
