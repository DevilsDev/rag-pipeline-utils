---
mdx:
  format: md
---

# Class: PluginAnalytics

## Constructors

### Constructor

```ts
new PluginAnalytics(_config): PluginAnalytics;
```

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `_config` | `any` |

#### Returns

`PluginAnalytics`

## Properties

| Property                                            | Type                                                      |
| --------------------------------------------------- | --------------------------------------------------------- |
| <a id="property-events"></a> `events`               | `any`[]                                                   |
| <a id="property-flushinterval"></a> `flushInterval` | `Timeout`                                                 |
| <a id="property-sessionid"></a> `sessionId`         | `` `${string}-${string}-${string}-${string}-${string}` `` |

## Methods

### getLastUsed()

```ts
getLastUsed(pluginId): Promise<number>;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `pluginId` | `any` |

#### Returns

`Promise`\<`number`\>

---

### trackInstallation()

```ts
trackInstallation(
   pluginId,
   version,
   result
): void;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `pluginId` | `any` |
| `version`  | `any` |
| `result`   | `any` |

#### Returns

`void`

---

### trackPluginView()

```ts
trackPluginView(pluginId): void;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `pluginId` | `any` |

#### Returns

`void`

---

### trackReview()

```ts
trackReview(pluginId, rating): void;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `pluginId` | `any` |
| `rating`   | `any` |

#### Returns

`void`

---

### trackSearch()

```ts
trackSearch(query, resultCount): void;
```

#### Parameters

| Parameter     | Type  |
| ------------- | ----- |
| `query`       | `any` |
| `resultCount` | `any` |

#### Returns

`void`
