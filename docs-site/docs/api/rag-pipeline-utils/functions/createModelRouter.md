---
mdx:
  format: md
---

# Function: createModelRouter()

```ts
function createModelRouter(options?): ModelRouter;
```

Create a cost-aware router over several LLMs.

## Parameters

| Parameter                       | Type                                                                                                                                                                                                                                                                                      | Description                                                                                                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?`                      | \{ `cacheKey?`: `string`; `calculator?`: [`CostCalculator`](../classes/CostCalculator.md); `classify?`: (`query`, `docs`) => `string` \| `Promise`\<`string`\>; `countTokens?`: (`text`) => `number`; `expectedOutputTokens?`: `number`; `fallback?`: `boolean`; `routes`: `object`[]; \} | -                                                                                                                                                                                                                                                             |
| `options.cacheKey?`             | `string`                                                                                                                                                                                                                                                                                  | Identity of a custom `classify` for createRagPipeline({ cache }); without it, a custom classifier turns the generation cache off                                                                                                                              |
| `options.calculator?`           | [`CostCalculator`](../classes/CostCalculator.md)                                                                                                                                                                                                                                          | Prices for routes without `pricing`                                                                                                                                                                                                                           |
| `options.classify?`             | (`query`, `docs`) => `string` \| `Promise`\<`string`\>                                                                                                                                                                                                                                    | Query class; defaults to [classifyQuery](classifyQuery.md)                                                                                                                                                                                                    |
| `options.countTokens?`          | (`text`) => `number`                                                                                                                                                                                                                                                                      | Token counter for the estimate (default: about 4 characters per token)                                                                                                                                                                                        |
| `options.expectedOutputTokens?` | `number`                                                                                                                                                                                                                                                                                  | Answer length used in the cost estimate (or `options.maxTokens` of a run, when set)                                                                                                                                                                           |
| `options.fallback?`             | `boolean`                                                                                                                                                                                                                                                                                 | When the chosen model fails, try the next cheapest route for the class (a stream only before its first token). Never on abort.                                                                                                                                |
| `options.routes`                | `object`[]                                                                                                                                                                                                                                                                                | The models to choose from. `handles` lists the query classes a route may serve (all classes when omitted); `pricing` is in USD per `unit` tokens (default 1000), and defaults to CostCalculator's price for `model`. A route with no known price is an error. |

## Returns

`ModelRouter`

## Example

```ts
const llm = createModelRouter({
  routes: [
    {
      model: "claude-haiku-4-5",
      llm: new AnthropicConnector({ model: "claude-haiku-4-5" }),
      handles: ["simple"],
    },
    { model: "claude-sonnet-5-5", llm: new AnthropicConnector() },
  ],
});
const pipeline = createRagPipeline({ embedder, retriever, llm });
const result = await pipeline.run({ query });
result.route; // { class: 'simple', model: 'claude-haiku-4-5', estimatedCost: 0.0021 }
```
