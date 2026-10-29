---
mdx:
  format: md
---

# Class: CitationTracker

Tracks citations between an LLM-generated answer and retrieved source documents.
Emits a 'tracked' event when citation analysis completes.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new CitationTracker(options?): CitationTracker;
```

#### Parameters

| Parameter                          | Type                                                                                                         | Description                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `options?`                         | \{ `maxCitationsPerSentence?`: `number`; `similarityThreshold?`: `number`; `useIDFWeighting?`: `boolean`; \} | Override default configuration          |
| `options.maxCitationsPerSentence?` | `number`                                                                                                     | Max citations per sentence              |
| `options.similarityThreshold?`     | `number`                                                                                                     | Minimum similarity for a citation match |
| `options.useIDFWeighting?`         | `boolean`                                                                                                    | Whether to apply IDF weighting          |

#### Returns

`CitationTracker`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### track()

```ts
track(answer, retrievedDocs): object;
```

Track citations for an answer against retrieved documents.

#### Parameters

| Parameter       | Type       | Description                                                             |
| --------------- | ---------- | ----------------------------------------------------------------------- |
| `answer`        | `string`   | The LLM-generated answer text                                           |
| `retrievedDocs` | `object`[] | Array of source documents (each should have .content, .text, or .chunk) |

#### Returns

`object`

##### citations

```ts
citations: object[];
```

##### groundednessScore

```ts
groundednessScore: number;
```

##### hallucinationReport

```ts
hallucinationReport: object;
```

##### metadata

```ts
metadata: object;
```

###### metadata.config

```ts
config: object;
```

###### metadata.docCount

```ts
docCount: number;
```

###### metadata.sentenceCount

```ts
sentenceCount: number;
```

#### Fires

CitationTracker#tracked
