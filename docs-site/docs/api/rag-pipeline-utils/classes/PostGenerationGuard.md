---
mdx:
  format: md
---

# Class: PostGenerationGuard

Post-generation guard that checks LLM output for PII leakage,
groundedness against source documents, and length constraints.
Sanitizes output by redacting detected PII.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new PostGenerationGuard(options?): PostGenerationGuard;
```

#### Parameters

| Parameter                          | Type                                                                                                                                                                                                                                                                                                     | Description                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `options?`                         | \{ `builtIn?`: `boolean`; `detectors?`: `object`[]; `enableGroundednessCheck?`: `boolean`; `enablePIIDetection?`: `boolean`; `groundednessThreshold?`: `number`; `maxResponseLength?`: `number`; `minResponseLength?`: `number`; `onDetectorError?`: `"skip"` \| `"block"`; `piiPatterns?`: `object`; \} | Override default configuration                                                                                              |
| `options.builtIn?`                 | `boolean`                                                                                                                                                                                                                                                                                                | false: use only `detectors`, not the built-in PII patterns                                                                  |
| `options.detectors?`               | `object`[]                                                                                                                                                                                                                                                                                               | PII detectors to run on the output too (see ./detectors); their matches are redacted. Async ones need checkAsync()          |
| `options.enableGroundednessCheck?` | `boolean`                                                                                                                                                                                                                                                                                                | Whether to check groundedness                                                                                               |
| `options.enablePIIDetection?`      | `boolean`                                                                                                                                                                                                                                                                                                | Whether to detect PII in output                                                                                             |
| `options.groundednessThreshold?`   | `number`                                                                                                                                                                                                                                                                                                 | Minimum groundedness score                                                                                                  |
| `options.maxResponseLength?`       | `number`                                                                                                                                                                                                                                                                                                 | Maximum allowed response length                                                                                             |
| `options.minResponseLength?`       | `number`                                                                                                                                                                                                                                                                                                 | Minimum response length                                                                                                     |
| `options.onDetectorError?`         | `"skip"` \| `"block"`                                                                                                                                                                                                                                                                                    | A detector that throws makes the output unsafe ('block'; what it would have found can't be redacted) or is ignored ('skip') |
| `options.piiPatterns?`             | `object`                                                                                                                                                                                                                                                                                                 | Custom PII regex patterns (merged with defaults)                                                                            |

#### Returns

`PostGenerationGuard`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### check()

```ts
check(output, retrievedDocs?): object;
```

Check generated output for safety issues, PII, and groundedness.

#### Parameters

| Parameter        | Type       | Description                                |
| ---------------- | ---------- | ------------------------------------------ |
| `output`         | `string`   | The LLM-generated output text              |
| `retrievedDocs?` | `object`[] | Source documents for groundedness checking |

#### Returns

`object`

##### groundednessScore?

```ts
groundednessScore?: number;
```

##### issues

```ts
issues: string[];
```

##### safe

```ts
safe: boolean;
```

##### sanitizedOutput

```ts
sanitizedOutput: string;
```

#### Fires

PostGenerationGuard#checked

---

### checkAsync()

```ts
checkAsync(
   output,
   retrievedDocs?,
   options?
): Promise<{
  groundednessScore?: number;
  issues: string[];
  safe: boolean;
  sanitizedOutput: string;
}>;
```

check() for async detectors, such as a model or a PII service.
Detectors run concurrently.

#### Parameters

| Parameter         | Type                            | Description                            |
| ----------------- | ------------------------------- | -------------------------------------- |
| `output`          | `string`                        | -                                      |
| `retrievedDocs?`  | `object`[]                      | -                                      |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | -                                      |
| `options.signal?` | `AbortSignal`                   | Passed to each detector in its context |

#### Returns

`Promise`\<\{
`groundednessScore?`: `number`;
`issues`: `string`[];
`safe`: `boolean`;
`sanitizedOutput`: `string`;
\}\>

---

### redact()

```ts
redact(text, matches?): string;
```

Replace PII matches in arbitrary text with [REDACTED], using the same
patterns as check(). Used to scrub text derived from the answer, such as
citation sentences. Detectors don't run here (they may be async):
pass the strings a check found, `detectedText(result)`, as `matches`
so they are removed too.

#### Parameters

| Parameter  | Type       | Description                     |
| ---------- | ---------- | ------------------------------- |
| `text`     | `string`   | -                               |
| `matches?` | `string`[] | Exact strings to redact as well |

#### Returns

`string`
