---
mdx:
  format: md
---

# Class: JWTValidator

JWT Validator with hardened security

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new JWTValidator(options?): JWTValidator;
```

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `options?` | \{ \} |

#### Returns

`JWTValidator`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                                      | Type                  |
| ------------------------------------------------------------- | --------------------- |
| <a id="property-config"></a> `config`                         | `object`              |
| `config.algorithm`                                            | `any`                 |
| `config.allowedAlgorithms`                                    | `any`                 |
| `config.allowNoneAlgorithm`                                   | `boolean`             |
| `config.audience`                                             | `any`                 |
| `config.clockTolerance`                                       | `any`                 |
| `config.enableAuditLog`                                       | `boolean`             |
| `config.enableJtiTracking`                                    | `boolean`             |
| `config.issuer`                                               | `any`                 |
| `config.jtiExpirationMs`                                      | `any`                 |
| `config.maxTokenAge`                                          | `any`                 |
| `config.maxTrackedJtis`                                       | `any`                 |
| `config.notBeforeTolerance`                                   | `any`                 |
| `config.privateKey`                                           | `any`                 |
| `config.publicKey`                                            | `any`                 |
| `config.requireJti`                                           | `boolean`             |
| `config.requireSub`                                           | `boolean`             |
| `config.secret`                                               | `any`                 |
| `config.singleUseTokens`                                      | `boolean`             |
| `config.strictValidation`                                     | `boolean`             |
| `config.validateClaims`                                       | `any`                 |
| <a id="property-jticleanupinterval"></a> `jtiCleanupInterval` | `Timeout`             |
| <a id="property-selfsignedjtis"></a> `selfSignedJtis`         | `Set`\<`any`\>        |
| <a id="property-stats"></a> `stats`                           | `object`              |
| `stats.algorithmMismatch`                                     | `number`              |
| `stats.expiredTokens`                                         | `number`              |
| `stats.invalidSignature`                                      | `number`              |
| `stats.replayAttempts`                                        | `number`              |
| `stats.tokensGenerated`                                       | `number`              |
| `stats.tokensValidated`                                       | `number`              |
| `stats.validationFailures`                                    | `number`              |
| <a id="property-usedjtis"></a> `usedJtis`                     | `Map`\<`any`, `any`\> |

## Methods

### clearJtiTracking()

```ts
clearJtiTracking(): void;
```

Clear JTI tracking

#### Returns

`void`

---

### decode()

```ts
decode(token): any;
```

Decode token without verification (use with caution)

#### Parameters

| Parameter | Type     | Description         |
| --------- | -------- | ------------------- |
| `token`   | `string` | JWT token to decode |

#### Returns

`any`

Decoded payload (unverified)

---

### destroy()

```ts
destroy(): void;
```

Destroy validator and cleanup resources

#### Returns

`void`

---

### getStats()

```ts
getStats(): any;
```

Get validator statistics

#### Returns

`any`

Statistics object

---

### resetStats()

```ts
resetStats(): void;
```

Reset statistics

#### Returns

`void`

---

### sign()

```ts
sign(payload, options?): string;
```

Generate a secure JWT token

#### Parameters

| Parameter  | Type  | Description                |
| ---------- | ----- | -------------------------- |
| `payload`  | `any` | Token payload              |
| `options?` | `any` | Additional signing options |

#### Returns

`string`

Signed JWT token

#### Example

```ts
const token = validator.sign({
  sub: "user-123",
  roles: ["admin"],
  tenant: "acme-corp",
});
```

---

### verify()

```ts
verify(token, options?): any;
```

Verify and decode a JWT token with hardened validation

#### Parameters

| Parameter  | Type     | Description          |
| ---------- | -------- | -------------------- |
| `token`    | `string` | JWT token to verify  |
| `options?` | `any`    | Verification options |

#### Returns

`any`

Decoded and validated payload

#### Example

```ts
try {
  const payload = validator.verify(token);
  console.log("Valid token for user:", payload.sub);
} catch (error) {
  console.error("Invalid token:", error.message);
}
```
