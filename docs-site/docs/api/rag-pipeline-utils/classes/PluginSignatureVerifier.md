---
mdx:
  format: md
---

# Class: PluginSignatureVerifier

## Constructors

### Constructor

```ts
new PluginSignatureVerifier(options?): PluginSignatureVerifier;
```

#### Parameters

| Parameter                  | Type                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `options?`                 | \{ \[`key`: `string`\]: `any`; `failClosed?`: `boolean`; `trustedKeysPath?`: `string`; \} |
| `options.failClosed?`      | `boolean`                                                                                 |
| `options.trustedKeysPath?` | `string`                                                                                  |

#### Returns

`PluginSignatureVerifier`

## Methods

### verify()

```ts
verify(pluginPath): Promise<boolean>;
```

#### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `pluginPath` | `string` |

#### Returns

`Promise`\<`boolean`\>
