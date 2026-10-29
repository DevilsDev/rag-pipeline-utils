---
mdx:
  format: md
---

# Class: ConnectionPoolManager

Connection Pool Manager Class

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new ConnectionPoolManager(options?): ConnectionPoolManager;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | \{ \} |

#### Returns

`ConnectionPoolManager`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                                    | Type                  |
| ----------------------------------------------------------- | --------------------- |
| <a id="property-activeconnections"></a> `activeConnections` | `number`              |
| <a id="property-config"></a> `config`                       | `object`              |
| `config.freeSocketTimeout`                                  | `number`              |
| `config.keepAlive`                                          | `boolean`             |
| `config.keepAliveMsecs`                                     | `number`              |
| `config.keepAliveTimeout`                                   | `number`              |
| `config.maxFreeSockets`                                     | `number`              |
| `config.maxSockets`                                         | `number`              |
| `config.maxSocketsPerHost`                                  | `number`              |
| `config.metricsInterval`                                    | `number`              |
| `config.scheduling`                                         | `string`              |
| `config.timeout`                                            | `number`              |
| `config.trackMetrics`                                       | `boolean`             |
| <a id="property-httpagent"></a> `httpAgent`                 | `Agent`               |
| <a id="property-httpsagent"></a> `httpsAgent`               | `Agent`               |
| <a id="property-maxtimingssamples"></a> `maxTimingsSamples` | `number`              |
| <a id="property-metrics"></a> `metrics`                     | `object`              |
| `metrics.avgResponseTime`                                   | `number`              |
| `metrics.cachedConnections`                                 | `number`              |
| `metrics.connectionReuse`                                   | `number`              |
| `metrics.connectionsCreated`                                | `number`              |
| `metrics.connectionsDestroyed`                              | `number`              |
| `metrics.currentPoolSize`                                   | `number`              |
| `metrics.errors`                                            | `number`              |
| `metrics.newConnections`                                    | `number`              |
| `metrics.peakPoolSize`                                      | `number`              |
| `metrics.poolExhausted`                                     | `number`              |
| `metrics.timeouts`                                          | `number`              |
| `metrics.totalRequests`                                     | `number`              |
| `metrics.totalResponseTime`                                 | `number`              |
| <a id="property-metricsinterval"></a> `metricsInterval`     | `Timeout`             |
| <a id="property-pools"></a> `pools`                         | `Map`\<`any`, `any`\> |
| <a id="property-requesttimings"></a> `requestTimings`       | `any`[]               |
| <a id="property-totalconnections"></a> `totalConnections`   | `number`              |

## Methods

### destroy()

```ts
destroy(): void;
```

Destroy all connections and cleanup

#### Returns

`void`

---

### getAgentForUrl()

```ts
getAgentForUrl(url): Agent | Agent;
```

Get agent for URL

#### Parameters

| Parameter | Type     | Description          |
| --------- | -------- | -------------------- |
| `url`     | `string` | URL to get agent for |

#### Returns

`Agent` \| `Agent`

Appropriate agent

---

### getHttpAgent()

```ts
getHttpAgent(): Agent;
```

Get HTTP agent

#### Returns

`Agent`

HTTP agent with connection pooling

---

### getHttpsAgent()

```ts
getHttpsAgent(): Agent;
```

Get HTTPS agent

#### Returns

`Agent`

HTTPS agent with connection pooling

---

### getMetrics()

```ts
getMetrics(): any;
```

Get current pool metrics

#### Returns

`any`

Current metrics

---

### getReport()

```ts
getReport(): string;
```

Get connection pool report

#### Returns

`string`

Human-readable pool report

---

### getStatus()

```ts
getStatus(): any;
```

Get pool status

#### Returns

`any`

Pool status information

---

### resetMetrics()

```ts
resetMetrics(): void;
```

Reset metrics

#### Returns

`void`

---

### trackError()

```ts
trackError(error, type?): void;
```

Track request error

#### Parameters

| Parameter | Type     | Description                         |
| --------- | -------- | ----------------------------------- |
| `error`   | `Error`  | Request error                       |
| `type?`   | `string` | Error type (timeout, network, etc.) |

#### Returns

`void`

---

### trackPoolExhaustion()

```ts
trackPoolExhaustion(): void;
```

Track pool exhaustion

#### Returns

`void`

---

### trackRequest()

```ts
trackRequest(duration): void;
```

Track request timing

#### Parameters

| Parameter  | Type     | Description                      |
| ---------- | -------- | -------------------------------- |
| `duration` | `number` | Request duration in milliseconds |

#### Returns

`void`
