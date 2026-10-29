---
mdx:
  format: md
---

# Variable: metrics

```ts
const metrics: object;
```

## Type Declaration

### counter()

```ts
counter(name): object;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

`object`

##### inc()

```ts
inc(): void;
```

###### Returns

`void`

### timer()

```ts
timer(name): object;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

`object`

##### end()

```ts
end(): void;
```

###### Returns

`void`
