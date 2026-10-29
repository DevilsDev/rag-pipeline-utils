---
mdx:
  format: md
---

# Class: EntityExtractor

Heuristic entity extraction from text — no LLM required.

Uses configurable regex patterns to identify named entities,
dates, measurements, URLs, emails, and technical terms.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new EntityExtractor(options?): EntityExtractor;
```

#### Parameters

| Parameter           | Type                                                   | Description                            |
| ------------------- | ------------------------------------------------------ | -------------------------------------- |
| `options?`          | \{ `patterns?`: \{ \[`x`: `string`\]: `RegExp`; \}; \} | Extractor options                      |
| `options.patterns?` | \{ \[`x`: `string`\]: `RegExp`; \}                     | Custom patterns to merge with defaults |

#### Returns

`EntityExtractor`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                  | Type     |
| ----------------------------------------- | -------- |
| <a id="property-config"></a> `config`     | `object` |
| `config.patterns?`                        | `object` |
| <a id="property-patterns"></a> `patterns` | `object` |

## Methods

### extract()

```ts
extract(text): object[];
```

Extract entities from a single text string.

For each configured pattern type, finds all matches, deduplicates
by normalized name, and returns an array of entity descriptors.

#### Parameters

| Parameter | Type     | Description                         |
| --------- | -------- | ----------------------------------- |
| `text`    | `string` | Input text to extract entities from |

#### Returns

`object`[]

---

### extractFromDocuments()

```ts
extractFromDocuments(documents): object;
```

Extract entities and relationships from multiple documents.

Combines entities across documents and tracks which source
document(s) each entity originates from.

#### Parameters

| Parameter   | Type       | Description |
| ----------- | ---------- | ----------- |
| `documents` | `object`[] | -           |

#### Returns

`object`

##### entities

```ts
entities: any[];
```

##### relationships

```ts
relationships: any[];
```

---

### extractRelationships()

```ts
extractRelationships(text, entities): object[];
```

Extract relationships between entities that co-occur in the same sentence.

#### Parameters

| Parameter  | Type       | Description                   |
| ---------- | ---------- | ----------------------------- |
| `text`     | `string`   | Input text                    |
| `entities` | `object`[] | Previously extracted entities |

#### Returns

`object`[]
