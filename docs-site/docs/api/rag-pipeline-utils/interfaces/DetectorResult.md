---
mdx:
  format: md
---

# Interface: DetectorResult

What a detector found. PII detectors must give each match's exact `text`, which is redacted.

## Properties

| Property                                 | Type       |
| ---------------------------------------- | ---------- |
| <a id="property-flagged"></a> `flagged`  | `boolean`  |
| <a id="property-labels"></a> `labels?`   | `string`[] |
| <a id="property-matches"></a> `matches?` | `object`[] |
| <a id="property-score"></a> `score?`     | `number`   |
