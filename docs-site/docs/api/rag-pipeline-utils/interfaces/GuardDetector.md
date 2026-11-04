---
mdx:
  format: md
---

# Interface: GuardDetector

A detector for the guards' `detectors` option: prompt injection
(PreRetrievalGuard, RetrievalGuard) or PII (PostGenerationGuard). Async
detectors need the guards' checkAsync() / filterAsync().

## Properties

| Property                          | Type                     |
| --------------------------------- | ------------------------ |
| <a id="property-kind"></a> `kind` | `"injection"` \| `"pii"` |
| <a id="property-name"></a> `name` | `string`                 |

## Methods

### detect()

```ts
detect(text, context):
  | DetectorResult
| Promise<DetectorResult>;
```

#### Parameters

| Parameter | Type                                    |
| --------- | --------------------------------------- |
| `text`    | `string`                                |
| `context` | [`DetectorContext`](DetectorContext.md) |

#### Returns

\| [`DetectorResult`](DetectorResult.md)
\| `Promise`\<[`DetectorResult`](DetectorResult.md)\>
