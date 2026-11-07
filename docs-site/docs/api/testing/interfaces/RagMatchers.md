---
mdx:
  format: md
---

# Interface: RagMatchers\<R\>

The rag matchers as they appear on `expect(received)`. Add them to your
test runner's types once, in a .d.ts file. Vitest:

```ts
import "vitest";
import type { RagMatchers } from "@devilsdev/rag-pipeline-utils/testing";

declare module "vitest" {
  interface Matchers<R, T> extends RagMatchers<R> {}
}
```

Jest:

```ts
import type { RagMatchers } from "@devilsdev/rag-pipeline-utils/testing";

declare global {
  namespace jest {
    interface Matchers<R> extends RagMatchers<R> {}
  }
}

export {};
```

## Type Parameters

| Type Parameter                    | Default type |
| --------------------------------- | ------------ |
| <a id="type-parameter-r"></a> `R` | `unknown`    |

## Methods

### toBeGroundedIn()

```ts
toBeGroundedIn(sources?, options?): R;
```

Every sentence of the answer is supported by the sources: its content
words, numbers and negation match a source. `sources` defaults to the
run() result's `results`.

#### Parameters

| Parameter                 | Type                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `sources?`                | `unknown`[]                                                 |
| `options?`                | \{ `conditionCheck?`: `boolean`; `threshold?`: `number`; \} |
| `options.conditionCheck?` | `boolean`                                                   |
| `options.threshold?`      | `number`                                                    |

#### Returns

`R`

---

### toCite()

```ts
toCite(ids, sources?): R;
```

The answer cites each of the given source ids.

#### Parameters

| Parameter  | Type                   |
| ---------- | ---------------------- |
| `ids`      | `string` \| `string`[] |
| `sources?` | `unknown`[]            |

#### Returns

`R`

---

### toContainNoPII()

```ts
toContainNoPII(options?): R;
```

No email, phone, US SSN or card number appears in the value.

#### Parameters

| Parameter           | Type                                               |
| ------------------- | -------------------------------------------------- |
| `options?`          | \{ `patterns?`: `Record`\<`string`, `RegExp`\>; \} |
| `options.patterns?` | `Record`\<`string`, `RegExp`\>                     |

#### Returns

`R`
