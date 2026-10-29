---
mdx:
  format: md
---

# Interface: DAGNode

## Properties

| Property                                       | Type                            |
| ---------------------------------------------- | ------------------------------- |
| <a id="property-id"></a> `id`                  | `string`                        |
| <a id="property-inputs"></a> `inputs?`         | `string`[]                      |
| <a id="property-maxretries"></a> `maxRetries?` | `number`                        |
| <a id="property-optional"></a> `optional?`     | `boolean`                       |
| <a id="property-outputs"></a> `outputs?`       | `string`[]                      |
| <a id="property-retrydelay"></a> `retryDelay?` | `number`                        |
| <a id="property-run"></a> `run`                | (`input`) => `Promise`\<`any`\> |
