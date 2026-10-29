---
mdx:
  format: md
---

# Class: RateLimiter

Sliding-window limiter: allows up to `maxAttempts` requests per identifier
in `windowMs`, then blocks that identifier for `blockDurationMs`. Check a
request with allowRequest(identifier).

## Constructors

### Constructor

```ts
new RateLimiter(options?): RateLimiter;
```

Create a rate limiter instance

#### Parameters

| Parameter                    | Type                                                                                                                 | Description                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `options?`                   | \{ `blockDurationMs?`: `number`; `cleanupIntervalMs?`: `number`; `maxAttempts?`: `number`; `windowMs?`: `number`; \} | Configuration options                                     |
| `options.blockDurationMs?`   | `number`                                                                                                             | How long to block after exceeding limit (default: 1 hour) |
| `options.cleanupIntervalMs?` | `number`                                                                                                             | How often to cleanup expired entries (default: 5 minutes) |
| `options.maxAttempts?`       | `number`                                                                                                             | Maximum attempts allowed (default: 5)                     |
| `options.windowMs?`          | `number`                                                                                                             | Time window in milliseconds (default: 15 minutes)         |

#### Returns

`RateLimiter`

## Properties

| Property                                                    | Type                  |
| ----------------------------------------------------------- | --------------------- |
| <a id="property-blockdurationms"></a> `blockDurationMs`     | `number`              |
| <a id="property-cleanupintervalms"></a> `cleanupIntervalMs` | `number`              |
| <a id="property-maxattempts"></a> `maxAttempts`             | `number`              |
| <a id="property-store"></a> `store`                         | `Map`\<`any`, `any`\> |
| <a id="property-windowms"></a> `windowMs`                   | `number`              |

## Methods

### allowRequest()

```ts
allowRequest(identifier): any;
```

Check if a request should be allowed

#### Parameters

| Parameter    | Type     | Description                                    |
| ------------ | -------- | ---------------------------------------------- |
| `identifier` | `string` | Unique identifier (IP, userId, tenantId, etc.) |

#### Returns

`any`

{ allowed: boolean, remaining: number, resetAt: Date, blockedUntil: Date|null }

---

### cleanup()

```ts
cleanup(): object;
```

Clean up expired entries

#### Returns

`object`

##### cleaned

```ts
cleaned: number;
```

##### remaining

```ts
remaining: number;
```

---

### destroy()

```ts
destroy(): void;
```

Stop the rate limiter and cleanup

#### Returns

`void`

---

### getStats()

```ts
getStats(): any;
```

Get statistics about rate limiter usage

#### Returns

`any`

Statistics

---

### getStatus()

```ts
getStatus(identifier): any;
```

Get current status for an identifier

#### Parameters

| Parameter    | Type     | Description         |
| ------------ | -------- | ------------------- |
| `identifier` | `string` | Identifier to check |

#### Returns

`any`

Current rate limit status

---

### reset()

```ts
reset(identifier): void;
```

Manually reset rate limit for an identifier

#### Parameters

| Parameter    | Type     | Description         |
| ------------ | -------- | ------------------- |
| `identifier` | `string` | Identifier to reset |

#### Returns

`void`
