---
mdx:
  format: md
---

# Class: QueryPlanner

Query decomposition planner. The default heuristic needs no LLM:

- splits only at clause/question boundaries: "?" / "." followed by more
  text, ";", and "and" / "or" / "as well as" (optionally after a comma)
  when a question word, auxiliary verb or imperative follows;
- keeps noun-phrase conjunctions intact ("salt and pepper", "A or B");
- expands comparisons ("X vs Y", "compare X and Y", "difference between X
  and Y") into one sub-query per entity plus the comparison itself.

`plan(query, { llm })` can instead ask an LLM for a JSON array of
sub-queries (strictly validated, heuristic fallback).

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new QueryPlanner(options?): QueryPlanner;
```

#### Parameters

| Parameter                       | Type                                                                 | Description                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `options?`                      | \{ `maxSubQueries?`: `number`; `minComplexityToSplit?`: `number`; \} | Override default configuration                                                                                     |
| `options.maxSubQueries?`        | `number`                                                             | Maximum number of sub-queries to produce                                                                           |
| `options.minComplexityToSplit?` | `number`                                                             | Minimum complexity score before splitting at conjunctions; punctuation boundaries and comparisons are always split |

#### Returns

`QueryPlanner`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### plan()

```ts
plan(query, options?):
  | Promise<object>
  | {
  complexity: number;
  originalQuery: string;
  source: "llm" | "heuristic";
  subQueries: object[];
};
```

Plan query decomposition.

Without `options.llm` this is synchronous and returns the plan. With
`options.llm` (an object with `generate()`), it returns a Promise of the
plan: the LLM is asked for a JSON array of sub-queries, which is strictly
validated (see \_parseLlmSubQueries); on any failure the heuristic plan is
used. `result.source` says which one was used.

#### Parameters

| Parameter              | Type                                                                   | Description                 |
| ---------------------- | ---------------------------------------------------------------------- | --------------------------- |
| `query`                | `string`                                                               | The user query to decompose |
| `options?`             | \{ `llm?`: \{ `generate`: `Function`; \}; `signal?`: `AbortSignal`; \} | -                           |
| `options.llm?`         | \{ `generate`: `Function`; \}                                          | Optional LLM planner        |
| `options.llm.generate` | `Function`                                                             | -                           |
| `options.signal?`      | `AbortSignal`                                                          | Passed to llm.generate()    |

#### Returns

\| `Promise`\<`object`\>
\| \{
`complexity`: `number`;
`originalQuery`: `string`;
`source`: `"llm"` \| `"heuristic"`;
`subQueries`: `object`[];
\}

#### Throws

If query is not a non-empty string

#### Fires

QueryPlanner#planned
