---
mdx:
  format: md
---

# Class: DashboardGenerator

Generates standalone HTML dashboards from pipeline metrics snapshots.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new DashboardGenerator(options?): DashboardGenerator;
```

#### Parameters

| Parameter  | Type                                    | Description |
| ---------- | --------------------------------------- | ----------- |
| `options?` | `Partial`\<`DashboardGeneratorConfig`\> | -           |

#### Returns

`DashboardGenerator`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type     | Description                                           |
| ------------------------------------- | -------- | ----------------------------------------------------- |
| <a id="property-config"></a> `config` | `object` | -                                                     |
| `config.refreshInterval`              | `number` | - Auto-refresh interval in ms (default: 5000)         |
| `config.theme`                        | `string` | - Color theme (default: 'dark')                       |
| `config.title`                        | `string` | - Dashboard title (default: 'RAG Pipeline Dashboard') |

## Methods

### generate()

```ts
generate(metricsSnapshot): string;
```

Generate a complete standalone HTML dashboard page.

#### Parameters

| Parameter         | Type  | Description                                   |
| ----------------- | ----- | --------------------------------------------- |
| `metricsSnapshot` | `any` | Snapshot from MetricsAggregator.getSnapshot() |

#### Returns

`string`

Complete HTML document string

---

### generateReport()

```ts
generateReport(metricsSnapshot): string;
```

Generate a plain-text summary report (for CLI/logs).

#### Parameters

| Parameter         | Type  | Description                                   |
| ----------------- | ----- | --------------------------------------------- |
| `metricsSnapshot` | `any` | Snapshot from MetricsAggregator.getSnapshot() |

#### Returns

`string`

Formatted text report
