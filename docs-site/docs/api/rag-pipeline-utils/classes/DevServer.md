---
mdx:
  format: md
---

# Class: DevServer

Development Server

Integrates hot reloading with a development workflow

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new DevServer(options?): DevServer;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | \{ \} |

#### Returns

`DevServer`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                    | Type                                                              |
| ------------------------------------------- | ----------------------------------------------------------------- |
| <a id="property-hotreload"></a> `hotReload` | [`HotReloadManager`](HotReloadManager.md)                         |
| <a id="property-isrunning"></a> `isRunning` | `boolean`                                                         |
| <a id="property-options"></a> `options`     | `object`                                                          |
| `options.autoReload`                        | `boolean`                                                         |
| `options.configPath`                        | `any`                                                             |
| `options.host`                              | `any`                                                             |
| `options.maxBodyBytes`                      | `any`                                                             |
| `options.notifyOnReload`                    | `boolean`                                                         |
| `options.pipeline`                          | `any`                                                             |
| `options.pluginRegistry`                    | `any`                                                             |
| `options.port`                              | `any`                                                             |
| `options.query`                             | `any`                                                             |
| `options.verbose`                           | `boolean`                                                         |
| `options.watchPaths`                        | `any`                                                             |
| <a id="property-port"></a> `port`           | `any`                                                             |
| <a id="property-server"></a> `server`       | `Server`\<_typeof_ `IncomingMessage`, _typeof_ `ServerResponse`\> |
| <a id="property-starttime"></a> `startTime` | `number`                                                          |

## Accessors

### url

#### Get Signature

```ts
get url(): string;
```

##### Returns

`string`

Base URL of the running server

## Methods

### getStatistics()

```ts
getStatistics(): string;
```

Get statistics dashboard

#### Returns

`string`

Formatted statistics

---

### getStatus()

```ts
getStatus(): object;
```

Get server status

#### Returns

`object`

Server status

---

### registerHook()

```ts
registerHook(hookName, callback): void;
```

Register a lifecycle hook

#### Parameters

| Parameter  | Type       | Description   |
| ---------- | ---------- | ------------- |
| `hookName` | `string`   | Hook name     |
| `callback` | `Function` | Hook callback |

#### Returns

`void`

---

### start()

```ts
start(): Promise<void>;
```

Start the development server

#### Returns

`Promise`\<`void`\>

---

### stop()

```ts
stop(): Promise<void>;
```

Stop the development server

#### Returns

`Promise`\<`void`\>

---

### triggerReload()

```ts
triggerReload(filePath, type?): Promise<void>;
```

Reloads a plugin or the config now, as if the file had changed.

#### Parameters

| Parameter  | Type                     | Description |
| ---------- | ------------------------ | ----------- |
| `filePath` | `string`                 | -           |
| `type?`    | `"plugin"` \| `"config"` | -           |

#### Returns

`Promise`\<`void`\>

---

### unregisterHook()

```ts
unregisterHook(hookName, callback): void;
```

Unregister a lifecycle hook

#### Parameters

| Parameter  | Type       | Description   |
| ---------- | ---------- | ------------- |
| `hookName` | `string`   | Hook name     |
| `callback` | `Function` | Hook callback |

#### Returns

`void`
