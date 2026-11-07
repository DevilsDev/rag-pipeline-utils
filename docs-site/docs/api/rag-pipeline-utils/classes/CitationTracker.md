---
mdx:
  format: md
---

# Class: CitationTracker

Tracks citations between an LLM-generated answer and retrieved source documents.
Emits a 'tracked' event when citation analysis completes.

## Extends

- `EventEmitter`

## Constructors

### Constructor

```ts
new CitationTracker(options?): CitationTracker;
```

#### Parameters

| Parameter                          | Type                                                                                                                                       | Description                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?`                         | \{ `conditionCheck?`: `boolean`; `maxCitationsPerSentence?`: `number`; `similarityThreshold?`: `number`; `useIDFWeighting?`: `boolean`; \} | Override default configuration                                                                                                                                                            |
| `options.conditionCheck?`          | `boolean`                                                                                                                                  | false: a sentence that leaves out a restricting condition of its source is no longer marked down (the 3.9 condition check), for scores comparable with a baseline saved on 3.8 or earlier |
| `options.maxCitationsPerSentence?` | `number`                                                                                                                                   | Max citations per sentence                                                                                                                                                                |
| `options.similarityThreshold?`     | `number`                                                                                                                                   | Minimum similarity for a citation match                                                                                                                                                   |
| `options.useIDFWeighting?`         | `boolean`                                                                                                                                  | Whether to apply IDF weighting                                                                                                                                                            |

#### Returns

`CitationTracker`

#### Overrides

`EventEmitter.constructor`

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
