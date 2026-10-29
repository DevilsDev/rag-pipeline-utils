---
mdx:
  format: md
---

# Class: BM25Search

Keyword search with BM25 ranking. Index documents with index(), then
search(query) returns them scored by term frequency and rarity.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new BM25Search(options?): BM25Search;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | \{ \} |

#### Returns

`BM25Search`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                            | Type                  |
| --------------------------------------------------- | --------------------- |
| <a id="property-avgdoclength"></a> `avgDocLength`   | `number`              |
| <a id="property-config"></a> `config`               | `object`              |
| `config.b`                                          | `number`              |
| `config.k1`                                         | `number`              |
| <a id="property-doccount"></a> `docCount`           | `number`              |
| <a id="property-doclengths"></a> `docLengths`       | `number`[]            |
| <a id="property-documents"></a> `documents`         | `any`[]               |
| <a id="property-invertedindex"></a> `invertedIndex` | `Map`\<`any`, `any`\> |

## Methods

### clear()

```ts
clear(): void;
```

Clear the index

#### Returns

`void`

---

### getStats()

```ts
getStats(): object;
```

Get index stats

#### Returns

`object`

##### avgDocLength

```ts
avgDocLength: number;
```

##### docCount

```ts
docCount: number;
```

##### uniqueTerms

```ts
uniqueTerms: number;
```

---

### index()

```ts
index(documents): void;
```

Index documents for BM25 search

#### Parameters

| Parameter   | Type    | Description                      |
| ----------- | ------- | -------------------------------- |
| `documents` | `any`[] | [{id, content\|text, metadata?}] |

#### Returns

`void`

---

### search()

```ts
search(query, options?): any[];
```

Search using BM25 scoring

#### Parameters

| Parameter  | Type     | Description |
| ---------- | -------- | ----------- |
| `query`    | `string` | -           |
| `options?` | `object` | {k: 10}     |

#### Returns

`any`[]

[{id, score, content, metadata}] sorted by BM25 score
