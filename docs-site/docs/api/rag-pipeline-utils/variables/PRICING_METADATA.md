---
mdx:
  format: md
---

# Variable: PRICING_METADATA

```ts
const PRICING_METADATA: Readonly<{
  asOf: "2026-04-07";
  currency: "USD";
  note: "Built-in list prices, not re-verified since asOf. Override with the `pricing` or `customPricing` option.";
  sources: Readonly<{
    anthropic: "https://www.anthropic.com/pricing#api";
    cohere: "https://cohere.com/pricing";
    openai: "https://openai.com/api/pricing/";
  }>;
  verified: false;
}>;
```

Where the built-in prices come from and when they were recorded.

The values are the providers' published list prices as copied into this
library on `asOf` (entries added later carry their own `asOf`); they have not been re-verified since and providers
change prices often. Pass `pricing` or `customPricing` to CostCalculator
to use current or negotiated prices.
