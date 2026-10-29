---
mdx:
  format: md
---

# Class: PluginAnalyticsDashboard

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new PluginAnalyticsDashboard(_options?): PluginAnalyticsDashboard;
```

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `_options?` | \{ \} |

#### Returns

`PluginAnalyticsDashboard`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                          | Type                  |
| ------------------------------------------------- | --------------------- |
| <a id="property-metrics"></a> `metrics`           | `Map`\<`any`, `any`\> |
| <a id="property-realtimedata"></a> `realTimeData` | `Map`\<`any`, `any`\> |
| <a id="property-subscribers"></a> `subscribers`   | `Set`\<`any`\>        |

## Methods

### calculateAverageRating()

```ts
calculateAverageRating(): number;
```

#### Returns

`number`

---

### calculatePercentile()

```ts
calculatePercentile(values, percentile): any;
```

#### Parameters

| Parameter    | Type  |
| ------------ | ----- |
| `values`     | `any` |
| `percentile` | `any` |

#### Returns

`any`

---

### calculateSecurityScore()

```ts
calculateSecurityScore(): number;
```

#### Returns

`number`

---

### cleanupOldData()

```ts
cleanupOldData(): Promise<void>;
```

#### Returns

`Promise`\<`void`\>

---

### collectMetrics()

```ts
collectMetrics(): Promise<void>;
```

#### Returns

`Promise`\<`void`\>

---

### formatActivityDescription()

```ts
formatActivityDescription(activity): string;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `activity` | `any` |

#### Returns

`string`

---

### generateHTMLDashboard()

```ts
generateHTMLDashboard(): Promise<string>;
```

Generate HTML dashboard

#### Returns

`Promise`\<`string`\>

---

### generateTimeSeriesData()

```ts
generateTimeSeriesData(): object;
```

Generate time series data for charts

#### Returns

`object`

##### installs

```ts
installs: any[];
```

##### ratings

```ts
ratings: any[];
```

##### searches

```ts
searches: any[];
```

##### securityScans

```ts
securityScans: any[];
```

---

### getActivityStatus()

```ts
getActivityStatus(activity): "warning" | "error" | "success";
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `activity` | `any` |

#### Returns

`"warning"` \| `"error"` \| `"success"`

---

### getDashboardData()

```ts
getDashboardData(): object;
```

Get dashboard data

#### Returns

`object`

##### metrics

```ts
metrics: any;
```

##### performanceSummary

```ts
performanceSummary: object;
```

###### performanceSummary.avgInstallTime

```ts
avgInstallTime: number;
```

###### performanceSummary.avgSearchLatency

```ts
avgSearchLatency: number;
```

###### performanceSummary.p95InstallTime

```ts
p95InstallTime: any;
```

###### performanceSummary.p95SearchLatency

```ts
p95SearchLatency: any;
```

##### recentActivity

```ts
recentActivity: any[];
```

##### securityOverview

```ts
securityOverview: object;
```

###### securityOverview.avgIssuesPerScan

```ts
avgIssuesPerScan: number;
```

###### securityOverview.riskDistribution

```ts
riskDistribution: object;
```

###### securityOverview.riskDistribution.high

```ts
high: number;
```

###### securityOverview.riskDistribution.low

```ts
low: number;
```

###### securityOverview.riskDistribution.medium

```ts
medium: number;
```

###### securityOverview.totalIssues

```ts
totalIssues: number;
```

###### securityOverview.totalScans

```ts
totalScans: number;
```

##### summary

```ts
summary: object;
```

###### summary.activePlugins

```ts
activePlugins: any;
```

###### summary.avgRating

```ts
avgRating: number;
```

###### summary.certifiedPlugins

```ts
certifiedPlugins: any;
```

###### summary.securityScore

```ts
securityScore: number;
```

###### summary.totalInstalls

```ts
totalInstalls: any;
```

###### summary.totalSearches

```ts
totalSearches: any;
```

##### timeSeriesData

```ts
timeSeriesData: object;
```

###### timeSeriesData.installs

```ts
installs: any[];
```

###### timeSeriesData.ratings

```ts
ratings: any[];
```

###### timeSeriesData.searches

```ts
searches: any[];
```

###### timeSeriesData.securityScans

```ts
securityScans: any[];
```

##### timestamp

```ts
timestamp: number;
```

##### topPlugins

```ts
topPlugins: any[];
```

---

### getPerformanceSummary()

```ts
getPerformanceSummary(): object;
```

Get performance summary

#### Returns

`object`

##### avgInstallTime

```ts
avgInstallTime: number;
```

##### avgSearchLatency

```ts
avgSearchLatency: number;
```

##### p95InstallTime

```ts
p95InstallTime: any;
```

##### p95SearchLatency

```ts
p95SearchLatency: any;
```

---

### getSecurityOverview()

```ts
getSecurityOverview(): object;
```

Get security overview

#### Returns

`object`

##### avgIssuesPerScan

```ts
avgIssuesPerScan: number;
```

##### riskDistribution

```ts
riskDistribution: object;
```

###### riskDistribution.high

```ts
high: number;
```

###### riskDistribution.low

```ts
low: number;
```

###### riskDistribution.medium

```ts
medium: number;
```

##### totalIssues

```ts
totalIssues: number;
```

##### totalScans

```ts
totalScans: number;
```

---

### getTopPlugins()

```ts
getTopPlugins(): any[];
```

Get top performing plugins

#### Returns

`any`[]

---

### incrementMetric()

```ts
incrementMetric(name, amount?): void;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `any`    |
| `amount?` | `number` |

#### Returns

`void`

---

### initializeMetrics()

```ts
initializeMetrics(): void;
```

Initialize metric collectors

#### Returns

`void`

---

### notifySubscribers()

```ts
notifySubscribers(): void;
```

#### Returns

`void`

---

### recordCertification()

```ts
recordCertification(
   pluginId,
   level,
   result
): void;
```

Record certification request

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `pluginId` | `any` |
| `level`    | `any` |
| `result`   | `any` |

#### Returns

`void`

---

### recordHistogram()

```ts
recordHistogram(name, value): void;
```

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `name`    | `any` |
| `value`   | `any` |

#### Returns

`void`

---

### recordInstallation()

```ts
recordInstallation(
   pluginId,
   version,
   metadata?
): void;
```

Record plugin installation

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `pluginId`  | `any` |
| `version`   | `any` |
| `metadata?` | \{ \} |

#### Returns

`void`

---

### recordRating()

```ts
recordRating(
   pluginId,
   rating,
   review?
): void;
```

Record plugin rating

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `pluginId` | `any` |
| `rating`   | `any` |
| `review?`  | `any` |

#### Returns

`void`

---

### recordSearch()

```ts
recordSearch(
   query,
   results,
   latency
): void;
```

Record plugin search

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `query`   | `any` |
| `results` | `any` |
| `latency` | `any` |

#### Returns

`void`

---

### recordSecurityScan()

```ts
recordSecurityScan(pluginId, result): void;
```

Record security scan

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `pluginId` | `any` |
| `result`   | `any` |

#### Returns

`void`

---

### startDataCollection()

```ts
startDataCollection(): void;
```

Start collecting analytics data

#### Returns

`void`

---

### subscribe()

```ts
subscribe(callback): () => boolean;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `callback` | `any` |

#### Returns

() => `boolean`

---

### updateRealTimeData()

```ts
updateRealTimeData(): void;
```

#### Returns

`void`
