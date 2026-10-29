---
mdx:
  format: md
---

# Class: PreRetrievalGuard

Pre-retrieval guard that validates and sanitizes user queries before
they reach the retrieval layer. Checks for injection attacks, topic
violations, and input length constraints.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new PreRetrievalGuard(options?): PreRetrievalGuard;
```

#### Parameters

| Parameter                           | Type                                                                                                                                                                                                         | Description                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `options?`                          | \{ `allowedTopics?`: `string`[]; `blockedTopics?`: `string`[]; `enableInjectionDetection?`: `boolean`; `enableTopicFiltering?`: `boolean`; `injectionPatterns?`: `RegExp`[]; `maxQueryLength?`: `number`; \} | Override default configuration                       |
| `options.allowedTopics?`            | `string`[]                                                                                                                                                                                                   | If non-empty, only these topics are permitted        |
| `options.blockedTopics?`            | `string`[]                                                                                                                                                                                                   | Topics to reject                                     |
| `options.enableInjectionDetection?` | `boolean`                                                                                                                                                                                                    | Whether to check for prompt injection                |
| `options.enableTopicFiltering?`     | `boolean`                                                                                                                                                                                                    | Whether to enforce topic constraints                 |
| `options.injectionPatterns?`        | `RegExp`[]                                                                                                                                                                                                   | Additional injection patterns (merged with defaults) |
| `options.maxQueryLength?`           | `number`                                                                                                                                                                                                     | Maximum allowed query length                         |

#### Returns

`PreRetrievalGuard`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### check()

```ts
check(query): object;
```

Check a query for safety issues, injection attempts, and topic violations.

#### Parameters

| Parameter | Type     | Description                |
| --------- | -------- | -------------------------- |
| `query`   | `string` | The user query to validate |

#### Returns

`object`

`sanitizedQuery` is the query truncated to maxQueryLength; it is never
rewritten. Injection findings are reported in `issues` and `injection`
and make `safe` false; blocking is up to the caller (GuardrailsPipeline
blocks in strict mode).

##### injection

```ts
injection: object;
```

###### injection.detected

```ts
detected: boolean;
```

###### injection.matches

```ts
matches: object[];
```

##### issues

```ts
issues: string[];
```

##### safe

```ts
safe: boolean;
```

##### sanitizedQuery

```ts
sanitizedQuery: string;
```

#### Fires

PreRetrievalGuard#checked
