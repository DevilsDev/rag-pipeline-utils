---
mdx:
  format: md
---

# Class: PluginHub

Client for a plugin hub registry: search, inspect, install, publish and
rate plugins.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new PluginHub(_options?): PluginHub;
```

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `_options?` | \{ \} |

#### Returns

`PluginHub`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                    | Type                                    |
| ------------------------------------------- | --------------------------------------- |
| <a id="property-analytics"></a> `analytics` | [`PluginAnalytics`](PluginAnalytics.md) |
| <a id="property-cache"></a> `cache`         | `Map`\<`any`, `any`\>                   |
| <a id="property-sandbox"></a> `sandbox`     | `PluginSandbox`                         |

## Methods

### getInstalledPlugins()

```ts
getInstalledPlugins(configPath?): Promise<object[]>;
```

Plugins registered in a project's config (see plugin-installer
listInstalledPlugins).

#### Parameters

| Parameter     | Type     | Description |
| ------------- | -------- | ----------- |
| `configPath?` | `string` | -           |

#### Returns

`Promise`\<`object`[]\>

---

### getPluginInfo()

```ts
getPluginInfo(pluginId): Promise<any>;
```

Get detailed plugin information

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `pluginId` | `any` |

#### Returns

`Promise`\<`any`\>

---

### getPluginReviews()

```ts
getPluginReviews(pluginId, _options?): Promise<any>;
```

Get plugin reviews and ratings

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `pluginId`  | `any` |
| `_options?` | \{ \} |

#### Returns

`Promise`\<`any`\>

---

### getTrendingPlugins()

```ts
getTrendingPlugins(_options?): Promise<any>;
```

Get trending plugins

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `_options?` | \{ \} |

#### Returns

`Promise`\<`any`\>

---

### installPlugin()

```ts
installPlugin(
   pluginId,
   version?,
   _options?
): Promise<any>;
```

Download a plugin from the registry and install it into a project
(see ecosystem/plugin-installer.js): sha256 verified against the
registry, static security scan (high-risk findings block unless
allowRisky), stage contract check, files kept inside
<project>/.rag/plugins, and `plugins.<stage>.<name>` added to the config.

#### Parameters

| Parameter                    | Type                                                                                                                                                 | Description                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `pluginId`                   | `string`                                                                                                                                             | Registry plugin id                            |
| `version?`                   | `string`                                                                                                                                             | -                                             |
| `_options?`                  | \{ `allowRisky?`: `boolean`; `configPath?`: `string`; `force?`: `boolean`; `name?`: `string`; `requireCertified?`: `boolean`; `stage?`: `string`; \} | -                                             |
| `_options.allowRisky?`       | `boolean`                                                                                                                                            | Install despite high-risk findings            |
| `_options.configPath?`       | `string`                                                                                                                                             | Config to register the plugin in              |
| `_options.force?`            | `boolean`                                                                                                                                            | Replace an installed plugin                   |
| `_options.name?`             | `string`                                                                                                                                             | Overrides package.json ragPipeline.name       |
| `_options.requireCertified?` | `boolean`                                                                                                                                            | Refuse plugins the registry marks uncertified |
| `_options.stage?`            | `string`                                                                                                                                             | Overrides package.json ragPipeline.stage      |

#### Returns

`Promise`\<`any`\>

---

### publishPlugin()

```ts
publishPlugin(pluginPath, _options?): Promise<any>;
```

Publish plugin to the hub

#### Parameters

| Parameter    | Type  |
| ------------ | ----- |
| `pluginPath` | `any` |
| `_options?`  | \{ \} |

#### Returns

`Promise`\<`any`\>

---

### ratePlugin()

```ts
ratePlugin(
   pluginId,
   rating,
   review?
): Promise<any>;
```

Rate and review a plugin

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `pluginId` | `any` |
| `rating`   | `any` |
| `review?`  | `any` |

#### Returns

`Promise`\<`any`\>

---

### searchPlugins()

```ts
searchPlugins(query, _options?): Promise<{
  facets: any;
  hasMore: any;
  results: any;
  total: any;
}>;
```

Search plugins in the community hub

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `query`     | `any` |
| `_options?` | \{ \} |

#### Returns

`Promise`\<\{
`facets`: `any`;
`hasMore`: `any`;
`results`: `any`;
`total`: `any`;
\}\>
