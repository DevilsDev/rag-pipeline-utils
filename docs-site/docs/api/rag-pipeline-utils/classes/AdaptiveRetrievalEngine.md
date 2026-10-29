---
mdx:
  format: md
---

# ~~Class: AdaptiveRetrievalEngine~~

## Deprecated

Experimental (simulated or incomplete). Import AdaptiveRetrievalEngine from "@devilsdev/rag-pipeline-utils/experimental"; it will be removed from the main entry in the next major release.

## Constructors

### Constructor

```ts
new AdaptiveRetrievalEngine(options?): AdaptiveRetrievalEngine;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | `any` |

#### Returns

`AdaptiveRetrievalEngine`

## Methods

### ~~optimizeRetrieval()~~

```ts
optimizeRetrieval(tenantId, performanceData): Promise<any>;
```

#### Parameters

| Parameter         | Type     |
| ----------------- | -------- |
| `tenantId`        | `string` |
| `performanceData` | `any`    |

#### Returns

`Promise`\<`any`\>

---

### ~~retrieveDocuments()~~

```ts
retrieveDocuments(
   tenantId,
   query,
   options?
): Promise<any>;
```

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `tenantId` | `string` |
| `query`    | `string` |
| `options?` | `any`    |

#### Returns

`Promise`\<`any`\>
