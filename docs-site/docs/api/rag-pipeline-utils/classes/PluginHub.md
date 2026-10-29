---
mdx:
  format: md
---

# Class: PluginHub

## Constructors

### Constructor

```ts
new PluginHub(options?): PluginHub;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | `any` |

#### Returns

`PluginHub`

## Methods

### install()

```ts
install(pluginName, options?): Promise<any>;
```

#### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `pluginName` | `string` |
| `options?`   | `any`    |

#### Returns

`Promise`\<`any`\>

---

### publish()

```ts
publish(pluginPath, options?): Promise<any>;
```

#### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `pluginPath` | `string` |
| `options?`   | `any`    |

#### Returns

`Promise`\<`any`\>

---

### search()

```ts
search(query, options?): Promise<any[]>;
```

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `query`    | `string` |
| `options?` | `any`    |

#### Returns

`Promise`\<`any`[]\>
