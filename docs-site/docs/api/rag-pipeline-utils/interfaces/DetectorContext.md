---
mdx:
  format: md
---

# Interface: DetectorContext

Where a guard runs a detector, with the document for retrieval guards.

## Properties

| Property                                   | Type                                    | Description                                                                            |
| ------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------- |
| <a id="property-document"></a> `document?` | `any`                                   | -                                                                                      |
| <a id="property-signal"></a> `signal?`     | `AbortSignal`                           | The request's AbortSignal, when the caller passed one to checkAsync() / filterAsync(). |
| <a id="property-stage"></a> `stage`        | `"query"` \| `"document"` \| `"output"` | -                                                                                      |
