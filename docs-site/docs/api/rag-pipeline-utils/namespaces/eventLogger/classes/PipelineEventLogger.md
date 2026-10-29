---
mdx:
  format: md
---

# Class: PipelineEventLogger

In-memory log of pipeline events (plugin and stage lifecycle, memory
warnings, custom events) tagged with a session id. A session is started
on the first event if startSession was not called.

## Constructors

### Constructor

```ts
new PipelineEventLogger(): PipelineEventLogger;
```

#### Returns

`PipelineEventLogger`

## Accessors

### sessionId

#### Get Signature

```ts
get sessionId(): string;
```

Current session id. Starts a session if none is active.

##### Returns

`string`

## Methods

### clearHistory()

```ts
clearHistory(): this;
```

Remove all recorded events. The session id is kept.

#### Returns

`this`

---

### exportEvents()

```ts
exportEvents(filters?): string;
```

Serialize the session id and the events matching the filters.

#### Parameters

| Parameter  | Type  | Description                     |
| ---------- | ----- | ------------------------------- |
| `filters?` | `any` | Same filters as getEventHistory |

#### Returns

`string`

JSON string with sessionId, eventCount and events

---

### getEventHistory()

```ts
getEventHistory(filters?): any[];
```

Recorded events, oldest first, optionally filtered.

#### Parameters

| Parameter             | Type                                                                                                                                                                                  | Description                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `filters?`            | \{ `eventType?`: `string`; `limit?`: `number`; `pluginType?`: `string`; `severity?`: `string`; `since?`: `string` \| `number` \| `Date`; `until?`: `string` \| `number` \| `Date`; \} | -                                        |
| `filters.eventType?`  | `string`                                                                                                                                                                              | -                                        |
| `filters.limit?`      | `number`                                                                                                                                                                              | Keep only the most recent `limit` events |
| `filters.pluginType?` | `string`                                                                                                                                                                              | -                                        |
| `filters.severity?`   | `string`                                                                                                                                                                              | -                                        |
| `filters.since?`      | `string` \| `number` \| `Date`                                                                                                                                                        | Only events at or after this time        |
| `filters.until?`      | `string` \| `number` \| `Date`                                                                                                                                                        | Only events at or before this time       |

#### Returns

`any`[]

---

### getInputSize()

```ts
getInputSize(v): object;
```

Describe a value's size: length for arrays and strings, key count for
objects, type only for null and primitives.

#### Parameters

| Parameter | Type  | Description       |
| --------- | ----- | ----------------- |
| `v`       | `any` | Value to describe |

#### Returns

`object`

##### keys?

```ts
keys?: number;
```

##### length?

```ts
length?: number;
```

##### type

```ts
type: string;
```

---

### getResultSize()

```ts
getResultSize(v): object;
```

Same as getInputSize.

#### Parameters

| Parameter | Type  | Description       |
| --------- | ----- | ----------------- |
| `v`       | `any` | Value to describe |

#### Returns

`object`

##### keys?

```ts
keys?: number;
```

##### length?

```ts
length?: number;
```

##### type

```ts
type: string;
```

---

### getSessionStats()

```ts
getSessionStats(): object;
```

Session id, total event count, session start time and the distinct event
types recorded. Starts a session if none is active.

#### Returns

`object`

##### eventTypes

```ts
eventTypes: string[];
```

##### sessionId

```ts
sessionId: string;
```

##### startTime

```ts
startTime: string;
```

##### totalEvents

```ts
totalEvents: number;
```

---

### logEvent()

```ts
logEvent(
   eventType,
   severity,
   metadata?,
   message?
): this;
```

Record an event of any type.

#### Parameters

| Parameter   | Type                            | Description                                        |
| ----------- | ------------------------------- | -------------------------------------------------- |
| `eventType` | `string`                        | Event type                                         |
| `severity`  | `string`                        | Severity level                                     |
| `metadata?` | \{ \[`x`: `string`\]: `any`; \} | Event metadata                                     |
| `message?`  | `string`                        | Message; defaults to 'Event: ' plus the event type |

#### Returns

`this`

---

### logMemoryWarning()

```ts
logMemoryWarning(event): void;
```

Record a warn-level memory.warning event. usagePercentage is heapUsed
(or rss if heapUsed is missing) in MB as a percentage of threshold.

#### Parameters

| Parameter                     | Type                                                                                         | Description                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `event`                       | \{ `memoryUsage`: \{ `heapUsed?`: `number`; `rss?`: `number`; \}; `threshold?`: `number`; \} | -                                                      |
| `event.memoryUsage`           | \{ `heapUsed?`: `number`; `rss?`: `number`; \}                                               | Memory figures in bytes, as from process.memoryUsage() |
| `event.memoryUsage.heapUsed?` | `number`                                                                                     | -                                                      |
| `event.memoryUsage.rss?`      | `number`                                                                                     | -                                                      |
| `event.threshold?`            | `number`                                                                                     | Threshold in MB                                        |

#### Returns

`void`

---

### logPluginEnd()

```ts
logPluginEnd(event): void;
```

Record a debug-level plugin.end event. When the result is an array, or
has a vectors array, its length is recorded as resultSize.vectorCount.

#### Parameters

| Parameter          | Type                                                                                                                                                             | Description                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `event`            | \{ `context?`: \{ \[`x`: `string`\]: `any`; \}; `duration?`: `number`; `pluginName`: `string`; `pluginType`: `string`; `result?`: `any`; `status?`: `string`; \} | -                                          |
| `event.context?`   | \{ \[`x`: `string`\]: `any`; \}                                                                                                                                  | Extra metadata                             |
| `event.duration?`  | `number`                                                                                                                                                         | Duration in milliseconds                   |
| `event.pluginName` | `string`                                                                                                                                                         | Plugin name                                |
| `event.pluginType` | `string`                                                                                                                                                         | Plugin type                                |
| `event.result?`    | `any`                                                                                                                                                            | Plugin result; only its length is recorded |
| `event.status?`    | `string`                                                                                                                                                         | Outcome                                    |

#### Returns

`void`

---

### logPluginError()

```ts
logPluginError(event): void;
```

Record an error-level plugin.error event with the error's name, message and code.

#### Parameters

| Parameter          | Type                                                                                                                                                    | Description              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `event`            | \{ `context?`: \{ \[`x`: `string`\]: `any`; \}; `duration?`: `number`; `error?`: `Error` & `object`; `pluginName`: `string`; `pluginType`: `string`; \} | -                        |
| `event.context?`   | \{ \[`x`: `string`\]: `any`; \}                                                                                                                         | Extra metadata           |
| `event.duration?`  | `number`                                                                                                                                                | Duration in milliseconds |
| `event.error?`     | `Error` & `object`                                                                                                                                      | The error thrown         |
| `event.pluginName` | `string`                                                                                                                                                | Plugin name              |
| `event.pluginType` | `string`                                                                                                                                                | Plugin type              |

#### Returns

`void`

---

### logPluginStart()

```ts
logPluginStart(event): void;
```

Record a debug-level plugin.start event with the input size and process info.

#### Parameters

| Parameter          | Type                                                                                                                | Description                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `event`            | \{ `context?`: \{ \[`x`: `string`\]: `any`; \}; `input?`: `any`; `pluginName`: `string`; `pluginType`: `string`; \} | -                                          |
| `event.context?`   | \{ \[`x`: `string`\]: `any`; \}                                                                                     | Extra metadata                             |
| `event.input?`     | `any`                                                                                                               | Plugin input; only its size is recorded    |
| `event.pluginName` | `string`                                                                                                            | Plugin name                                |
| `event.pluginType` | `string`                                                                                                            | Plugin type, such as embedder or retriever |

#### Returns

`void`

---

### logStageEnd()

```ts
logStageEnd(
   stage,
   duration,
   metadata?
): this;
```

Record an info-level stage.end event.

#### Parameters

| Parameter   | Type                            | Description                                   |
| ----------- | ------------------------------- | --------------------------------------------- |
| `stage`     | `string`                        | Stage name                                    |
| `duration`  | `number`                        | Duration in milliseconds                      |
| `metadata?` | \{ \[`x`: `string`\]: `any`; \} | Extra metadata merged into the event metadata |

#### Returns

`this`

---

### logStageStart()

```ts
logStageStart(stage): void;
```

Record an info-level stage.start event.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `stage`   | `string` | Stage name  |

#### Returns

`void`

---

### nowISO()

```ts
nowISO(): string;
```

Current time as an ISO 8601 string.

#### Returns

`string`

---

### startSession()

```ts
startSession(): string;
```

Start a new session with a fresh id and start time. Existing events are kept.

#### Returns

`string`

The new session id
