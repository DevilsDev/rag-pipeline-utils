---
mdx:
  format: md
---

# Class: RetrievalGuard

Retrieval guard that filters search results based on relevance score,
document freshness, and access control lists. Applied between the
retrieval and generation stages of the pipeline.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new RetrievalGuard(options?): RetrievalGuard;
```

#### Parameters

| Parameter                    | Type                                                                                                                                                                                                  | Description                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `options?`                   | \{ `detectInjection?`: `boolean`; `enforceACL?`: `boolean`; `injectionAction?`: `"remove"` \| `"flag"`; `injectionPatterns?`: `RegExp`[]; `maxAgeDays?`: `number`; `minRelevanceScore?`: `number`; \} | Override default configuration                 |
| `options.detectInjection?`   | `boolean`                                                                                                                                                                                             | Scan document text for prompt injection        |
| `options.enforceACL?`        | `boolean`                                                                                                                                                                                             | Whether to enforce access control              |
| `options.injectionAction?`   | `"remove"` \| `"flag"`                                                                                                                                                                                | Remove flagged documents or keep and mark them |
| `options.injectionPatterns?` | `RegExp`[]                                                                                                                                                                                            | Extra injection patterns for the scan          |
| `options.maxAgeDays?`        | `number`                                                                                                                                                                                              | Maximum document age in days (0 = disabled)    |
| `options.minRelevanceScore?` | `number`                                                                                                                                                                                              | Minimum relevance score threshold              |

#### Returns

`RetrievalGuard`

#### Overrides

`EventEmitter<[never]>.constructor`

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
