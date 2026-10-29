---
mdx:
  format: md
---

# ~~Class: ModelTrainingOrchestrator~~

## Deprecated

Experimental (simulated or incomplete). Import ModelTrainingOrchestrator from "@devilsdev/rag-pipeline-utils/experimental"; it will be removed from the main entry in the next major release.

## Constructors

### Constructor

```ts
new ModelTrainingOrchestrator(options?): ModelTrainingOrchestrator;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | `any` |

#### Returns

`ModelTrainingOrchestrator`

## Methods

### ~~createTrainingJob()~~

```ts
createTrainingJob(tenantId, config): Promise<any>;
```

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `tenantId` | `string` |
| `config`   | `any`    |

#### Returns

`Promise`\<`any`\>

---

### ~~deployModel()~~

```ts
deployModel(jobId, deployConfig): Promise<any>;
```

#### Parameters

| Parameter      | Type     |
| -------------- | -------- |
| `jobId`        | `string` |
| `deployConfig` | `any`    |

#### Returns

`Promise`\<`any`\>

---

### ~~getJobStatus()~~

```ts
getJobStatus(jobId): Promise<any>;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `jobId`   | `string` |

#### Returns

`Promise`\<`any`\>

---

### ~~optimizeModel()~~

```ts
optimizeModel(config): Promise<any>;
```

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `config`  | `any` |

#### Returns

`Promise`\<`any`\>
