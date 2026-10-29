---
mdx:
  format: md
---

# Class: PluginSignatureVerifier

Plugin signature verification with Ed25519

## Constructors

### Constructor

```ts
new PluginSignatureVerifier(options?): PluginSignatureVerifier;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | \{ \} |

#### Returns

`PluginSignatureVerifier`

## Properties

| Property                                                          | Type      |
| ----------------------------------------------------------------- | --------- |
| <a id="property-auditlogger"></a> `auditLogger`                   | `any`     |
| <a id="property-enabled"></a> `enabled`                           | `boolean` |
| <a id="property-failclosed"></a> `failClosed`                     | `boolean` |
| <a id="property-requirecontentdigest"></a> `requireContentDigest` | `boolean` |
| <a id="property-truststore"></a> `trustStore`                     | `any`     |

## Methods

### addTrustedSigner()

```ts
addTrustedSigner(
   signerId,
   publicKey,
   name,
   metadata?
): void;
```

Add trusted signer

#### Parameters

| Parameter   | Type                                                     | Description                                                                          |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `signerId`  | `string`                                                 | Signer identifier                                                                    |
| `publicKey` | `string` \| `Buffer`\<`ArrayBufferLike`\> \| `KeyObject` | Ed25519 public key: 64 hex characters (raw 32 bytes), PEM, DER (SPKI) or a KeyObject |
| `name`      | `string`                                                 | Human-readable name                                                                  |
| `metadata?` | `object`                                                 | Additional metadata                                                                  |

#### Returns

`void`

---

### getSigningPayload()

```ts
getSigningPayload(manifest): Buffer;
```

Bytes that a signer must sign for a manifest (canonical JSON).

#### Parameters

| Parameter  | Type     | Description     |
| ---------- | -------- | --------------- |
| `manifest` | `object` | Plugin manifest |

#### Returns

`Buffer`

---

### listTrustedSigners()

```ts
listTrustedSigners(): any[];
```

List trusted signers

#### Returns

`any`[]

List of trusted signers

---

### removeTrustedSigner()

```ts
removeTrustedSigner(signerId): any;
```

Remove trusted signer

#### Parameters

| Parameter  | Type     | Description       |
| ---------- | -------- | ----------------- |
| `signerId` | `string` | Signer identifier |

#### Returns

`any`

---

### verifyPluginSignature()

```ts
verifyPluginSignature(
   manifest,
   signature,
   signerId,
   content?
): Promise<object>;
```

Verify plugin signature

#### Parameters

| Parameter   | Type     | Description                                                                                                       |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `manifest`  | `object` | Plugin manifest                                                                                                   |
| `signature` | `string` | Base64 encoded signature                                                                                          |
| `signerId`  | `string` | Signer identifier                                                                                                 |
| `content?`  | `object` | Plugin content to check against manifest.contentDigest: `{ files, baseDir, contents }` (see computeContentDigest) |

#### Returns

`Promise`\<`object`\>

Verification result
