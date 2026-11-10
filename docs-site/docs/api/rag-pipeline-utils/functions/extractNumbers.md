---
mdx:
  format: md
---

# Function: extractNumbers()

```ts
function extractNumbers(text): object;
```

Extract the numbers stated in a text, as normalised value strings, so
"20", "20%", "twenty" and "Twenty" all yield "20", "1,000" yields "1000"
and "2.5" yields "2.5". Digits followed by thousand, million, billion or
trillion are one value: "5 million" and "5,000,000" both yield "5000000".

## Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `text`    | `string` | -           |

## Returns

`object`

values: one entry per
number as written; parts: values plus each number word on its own
(used on the document side so "twenty-five" also supports "20" and "5"
is not required)

### parts

```ts
parts: string[];
```

### values

```ts
values: string[];
```
