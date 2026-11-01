---
mdx:
  format: md
---

# Interface: RouteDecision

Which model a createModelRouter() chose for a run.

## Properties

| Property                                            | Type       | Description                                                         |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| <a id="property-class"></a> `class`                 | `string`   | The query class from the router's classifier.                       |
| <a id="property-estimatedcost"></a> `estimatedCost` | `number`   | Estimated cost in USD of the chosen model for this query.           |
| <a id="property-fallbackfrom"></a> `fallbackFrom?`  | `string`[] | Models that failed before `model` answered (with `fallback: true`). |
| <a id="property-model"></a> `model`                 | `string`   | The model that answered.                                            |
