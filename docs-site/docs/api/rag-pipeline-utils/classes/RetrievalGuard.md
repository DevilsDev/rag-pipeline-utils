---
mdx:
  format: md
---

# Class: RetrievalGuard

Retrieval guard that filters search results based on relevance score,
document freshness, and access control lists. Applied between the
retrieval and generation stages of the pipeline.

## Extends

- `EventEmitter`

## Constructors

### Constructor

```ts
new RetrievalGuard(options?): RetrievalGuard;
```

#### Parameters

| Parameter                    | Type                                                                                                                                                                                                                                                                                              | Description                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?`                   | \{ `builtIn?`: `boolean`; `detectInjection?`: `boolean`; `detectors?`: `object`[]; `enforceACL?`: `boolean`; `injectionAction?`: `"remove"` \| `"flag"`; `injectionPatterns?`: `RegExp`[]; `maxAgeDays?`: `number`; `minRelevanceScore?`: `number`; `onDetectorError?`: `"skip"` \| `"block"`; \} | Override default configuration                                                                                                                                                        |
| `options.builtIn?`           | `boolean`                                                                                                                                                                                                                                                                                         | false: use only `detectors` for the injection scan                                                                                                                                    |
| `options.detectInjection?`   | `boolean`                                                                                                                                                                                                                                                                                         | Scan document text for prompt injection                                                                                                                                               |
| `options.detectors?`         | `object`[]                                                                                                                                                                                                                                                                                        | Injection detectors to run on each document's text too, when detectInjection is on (see ./detectors); async ones need filterAsync(), which calls them once per document, concurrently |
| `options.enforceACL?`        | `boolean`                                                                                                                                                                                                                                                                                         | Whether to enforce access control                                                                                                                                                     |
| `options.injectionAction?`   | `"remove"` \| `"flag"`                                                                                                                                                                                                                                                                            | Remove flagged documents or keep and mark them                                                                                                                                        |
| `options.injectionPatterns?` | `RegExp`[]                                                                                                                                                                                                                                                                                        | Extra injection patterns for the scan                                                                                                                                                 |
| `options.maxAgeDays?`        | `number`                                                                                                                                                                                                                                                                                          | Maximum document age in days (0 = disabled)                                                                                                                                           |
| `options.minRelevanceScore?` | `number`                                                                                                                                                                                                                                                                                          | Minimum relevance score threshold                                                                                                                                                     |
| `options.onDetectorError?`   | `"skip"` \| `"block"`                                                                                                                                                                                                                                                                             | A detector that throws counts as a finding ('block': the document is removed or flagged) or is ignored ('skip')                                                                       |

#### Returns

`RetrievalGuard`

#### Overrides

`EventEmitter.constructor`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### filter()

```ts
filter(results, context?): object;
```

Filter retrieval results based on configured guards.

#### Parameters

| Parameter                  | Type                                  | Description                                                         |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `results`                  | `object`[]                            | Array of retrieval results, each with .score and optional .metadata |
| `context?`                 | \{ `userPermissions?`: `string`[]; \} | Request context                                                     |
| `context.userPermissions?` | `string`[]                            | User's permission roles for ACL filtering                           |

#### Returns

`object`

##### metadata

```ts
metadata: object;
```

###### metadata.reasons

```ts
reasons: object;
```

###### Index Signature

```ts
[x: string]: number
```

##### removed

```ts
removed: object[];
```

##### results

```ts
results: object[];
```

#### Fires

RetrievalGuard#filtered

---

### filterAsync()

```ts
filterAsync(
   results,
   context?,
   options?
): Promise<{
  metadata: {
     reasons: {
      [x: string]: number;
     };
  };
  removed: object[];
  results: object[];
}>;
```

filter() for async detectors, such as a classifier model or a service. Each
document that reaches the injection scan is checked by every detector,
all concurrently.

#### Parameters

| Parameter         | Type                            | Description                            |
| ----------------- | ------------------------------- | -------------------------------------- |
| `results`         | `object`[]                      | -                                      |
| `context?`        | `object`                        | -                                      |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | -                                      |
| `options.signal?` | `AbortSignal`                   | Passed to each detector in its context |

#### Returns

`Promise`\<\{
`metadata`: \{
`reasons`: \{
\[`x`: `string`\]: `number`;
\};
\};
`removed`: `object`[];
`results`: `object`[];
\}\>
