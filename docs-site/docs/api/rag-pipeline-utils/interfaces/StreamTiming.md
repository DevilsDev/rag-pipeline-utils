---
mdx:
  format: md
---

# Interface: StreamTiming

When a streamed answer started and finished, from the start of run().

## Properties

| Property                                          | Type     | Description                                                 |
| ------------------------------------------------- | -------- | ----------------------------------------------------------- |
| <a id="property-firsttokenms"></a> `firstTokenMs` | `number` | When the first non-empty token arrived; null when none did. |
| <a id="property-totalms"></a> `totalMs`           | `number` | -                                                           |
