---
mdx:
  format: md
---

# Class: SelfCritiqueChecker

Answer verification against retrieved source documents.
Uses CitationTracker (lazy-loaded) to compute groundedness and detect hallucinations.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new SelfCritiqueChecker(options?): SelfCritiqueChecker;
```

#### Parameters

| Parameter                    | Type                                  | Description                                     |
| ---------------------------- | ------------------------------------- | ----------------------------------------------- |
| `options?`                   | \{ `approvalThreshold?`: `number`; \} | Override default configuration                  |
| `options.approvalThreshold?` | `number`                              | Minimum groundedness score to approve an answer |

#### Returns

`SelfCritiqueChecker`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### check()

```ts
check(answer, retrievedDocs): object;
```

Check an answer against retrieved documents for groundedness.

#### Parameters

| Parameter       | Type       | Description                        |
| --------------- | ---------- | ---------------------------------- |
| `answer`        | `string`   | The LLM-generated answer to verify |
| `retrievedDocs` | `object`[] | Source documents to check against  |

#### Returns

`object`

##### approved

```ts
approved: boolean;
```

##### citationResult

```ts
citationResult: object;
```

##### issues

```ts
issues: object[];
```

##### score

```ts
score: number;
```

#### Throws

If answer or retrievedDocs are invalid

#### Fires

SelfCritiqueChecker#checked
