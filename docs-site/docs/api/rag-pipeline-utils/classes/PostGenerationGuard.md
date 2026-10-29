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

| Parameter                          | Type                                                                                                                                                                                                         | Description                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `options?`                         | \{ `enableGroundednessCheck?`: `boolean`; `enablePIIDetection?`: `boolean`; `groundednessThreshold?`: `number`; `maxResponseLength?`: `number`; `minResponseLength?`: `number`; `piiPatterns?`: `object`; \} | Override default configuration                   |
| `options.enableGroundednessCheck?` | `boolean`                                                                                                                                                                                                    | Whether to check groundedness                    |
| `options.enablePIIDetection?`      | `boolean`                                                                                                                                                                                                    | Whether to detect PII in output                  |
| `options.groundednessThreshold?`   | `number`                                                                                                                                                                                                     | Minimum groundedness score                       |
| `options.maxResponseLength?`       | `number`                                                                                                                                                                                                     | Maximum allowed response length                  |
| `options.minResponseLength?`       | `number`                                                                                                                                                                                                     | Minimum response length                          |
| `options.piiPatterns?`             | `object`                                                                                                                                                                                                     | Custom PII regex patterns (merged with defaults) |

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

### redact()

```ts
redact(text): string;
```

Replace PII matches in arbitrary text with [REDACTED], using the same
patterns as check(). Used to scrub text derived from the answer, such as
citation sentences.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `text`    | `string` | -           |

#### Returns

`string`
