---
mdx:
  format: md
---

# Class: HotReloadManager

Hot Reload Manager

Manages file watching and hot reloading of plugins and configuration.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new HotReloadManager(options?): HotReloadManager;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | \{ \} |

#### Returns

`HotReloadManager`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                              | Type                  |
| ----------------------------------------------------- | --------------------- |
| <a id="property-debouncetimers"></a> `debounceTimers` | `Map`\<`any`, `any`\> |
| <a id="property-hooks"></a> `hooks`                   | `object`              |
| `hooks.afterReload`                                   | `any`[]               |
| `hooks.beforeReload`                                  | `any`[]               |
| `hooks.onError`                                       | `any`[]               |
| `hooks.onStatePreserve`                               | `any`[]               |
| `hooks.onStateRestore`                                | `any`[]               |
| <a id="property-isreloading"></a> `isReloading`       | `boolean`             |
| <a id="property-options"></a> `options`               | `object`              |
| `options.configPath`                                  | `any`                 |
| `options.debounceDelay`                               | `any`                 |
| `options.enabled`                                     | `boolean`             |
| `options.ignorePatterns`                              | `any`                 |
| `options.preserveState`                               | `boolean`             |
| `options.verbose`                                     | `any`                 |
| `options.watchPaths`                                  | `any`                 |
| <a id="property-pluginregistry"></a> `pluginRegistry` | `any`                 |
| <a id="property-pluginstate"></a> `pluginState`       | `Map`\<`any`, `any`\> |
| <a id="property-reloadhistory"></a> `reloadHistory`   | `any`[]               |
| <a id="property-reloadqueue"></a> `reloadQueue`       | `Map`\<`any`, `any`\> |
| <a id="property-stats"></a> `stats`                   | `object`              |
| `stats.averageReloadTime`                             | `number`              |
| `stats.configReloads`                                 | `number`              |
| `stats.failedReloads`                                 | `number`              |
| `stats.pluginReloads`                                 | `number`              |
| `stats.successfulReloads`                             | `number`              |
| `stats.totalReloads`                                  | `number`              |
| <a id="property-watchers"></a> `watchers`             | `any`[]               |

## Methods

### clearHistory()

```ts
clearHistory(): void;
```

Clear reload history

#### Returns

`void`

---

### getHistory()

```ts
getHistory(): object[];
```

Get reload history

#### Returns

`object`[]

Reload history

---

### getStats()

```ts
getStats(): object;
```

Get reload statistics

#### Returns

`object`

Reload statistics

---

### registerHook()

```ts
registerHook(hookName, callback): void;
```

Register a lifecycle hook

#### Parameters

| Parameter  | Type       | Description                                          |
| ---------- | ---------- | ---------------------------------------------------- |
| `hookName` | `string`   | Hook name (beforeReload, afterReload, onError, etc.) |
| `callback` | `Function` | Hook callback                                        |

#### Returns

`void`

---

### start()

```ts
start(): Promise<void>;
```

Start watching for file changes

#### Returns

`Promise`\<`void`\>

---

### stop()

```ts
stop(): Promise<void>;
```

Stop watching for file changes

#### Returns

`Promise`\<`void`\>

---

### triggerReload()

```ts
triggerReload(filePath, type?): Promise<void>;
```

Manually trigger a reload

#### Parameters

| Parameter  | Type     | Description                 |
| ---------- | -------- | --------------------------- |
| `filePath` | `string` | File path to reload         |
| `type?`    | `string` | Type ('plugin' or 'config') |

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
