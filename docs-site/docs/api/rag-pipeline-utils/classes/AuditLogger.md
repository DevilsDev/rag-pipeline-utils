---
mdx:
  format: md
---

# Class: AuditLogger

Records authentication, data access, data change and other audit events
in hash-chained logs, with querying, compliance reports and an integrity
check.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new AuditLogger(_options?): AuditLogger;
```

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `_options?` | \{ \} |

#### Returns

`AuditLogger`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                              | Type                                      |
| ----------------------------------------------------- | ----------------------------------------- |
| <a id="property-encryptionkey"></a> `encryptionKey`   | `string` \| `Buffer`\<`ArrayBufferLike`\> |
| <a id="property-flushtimer"></a> `flushTimer`         | `Timeout`                                 |
| <a id="property-logbuffer"></a> `logBuffer`           | `any`[]                                   |
| <a id="property-sequencenumber"></a> `sequenceNumber` | `number`                                  |
| <a id="property-signingkey"></a> `signingKey`         | `any`                                     |

## Methods

### cleanupOldLogs()

```ts
cleanupOldLogs(): Promise<{
  bytesFreed: number;
  errors: any[];
  filesRemoved: number;
}>;
```

Cleanup old logs based on retention policy

#### Returns

`Promise`\<\{
`bytesFreed`: `number`;
`errors`: `any`[];
`filesRemoved`: `number`;
\}\>

---

### generateComplianceReport()

```ts
generateComplianceReport(_options): Promise<{
  compliance: {
     recommendations: any[];
     requirements: any[];
     violations: any[];
  };
  evidence: any[];
  metadata: {
     generatedAt: string;
     period: {
        endDate: any;
        startDate: any;
     };
     standard: any;
     totalEvents: number;
  };
  summary: {
     authenticationEvents: number;
     authorizationEvents: number;
     complianceEvents: number;
     criticalEvents: number;
     dataAccessEvents: number;
     dataModificationEvents: number;
     failedEvents: number;
     systemChangeEvents: number;
  };
}>;
```

Generate compliance report

#### Parameters

| Parameter  | Type  |
| ---------- | ----- |
| `_options` | `any` |

#### Returns

`Promise`\<\{
`compliance`: \{
`recommendations`: `any`[];
`requirements`: `any`[];
`violations`: `any`[];
\};
`evidence`: `any`[];
`metadata`: \{
`generatedAt`: `string`;
`period`: \{
`endDate`: `any`;
`startDate`: `any`;
\};
`standard`: `any`;
`totalEvents`: `number`;
\};
`summary`: \{
`authenticationEvents`: `number`;
`authorizationEvents`: `number`;
`complianceEvents`: `number`;
`criticalEvents`: `number`;
`dataAccessEvents`: `number`;
`dataModificationEvents`: `number`;
`failedEvents`: `number`;
`systemChangeEvents`: `number`;
\};
\}\>

---

### logAPIAccess()

```ts
logAPIAccess(event): Promise<any>;
```

Log API access events

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `event`   | `any` |

#### Returns

`Promise`\<`any`\>

---

### logAuthentication()

```ts
logAuthentication(event): Promise<any>;
```

Log authentication events

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `event`   | `any` |

#### Returns

`Promise`\<`any`\>

---

### logAuthorization()

```ts
logAuthorization(event): Promise<any>;
```

Log authorization events

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `event`   | `any` |

#### Returns

`Promise`\<`any`\>

---

### logComplianceEvent()

```ts
logComplianceEvent(event): Promise<any>;
```

Log compliance events

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `event`   | `any` |

#### Returns

`Promise`\<`any`\>

---

### logDataAccess()

```ts
logDataAccess(event): Promise<any>;
```

Log data access events

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `event`   | `any` |

#### Returns

`Promise`\<`any`\>

---

### logDataModification()

```ts
logDataModification(event): Promise<any>;
```

Log data modification events

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `event`   | `any` |

#### Returns

`Promise`\<`any`\>

---

### logSystemChanges()

```ts
logSystemChanges(event): Promise<any>;
```

Log system configuration changes

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `event`   | `any` |

#### Returns

`Promise`\<`any`\>

---

### queryLogs()

```ts
queryLogs(query): Promise<{
  hasMore: boolean;
  results: any[];
  total: number;
}>;
```

Query audit logs

#### Parameters

| Parameter | Type  |
| --------- | ----- |
| `query`   | `any` |

#### Returns

`Promise`\<\{
`hasMore`: `boolean`;
`results`: `any`[];
`total`: `number`;
\}\>

---

### verifyIntegrity()

```ts
verifyIntegrity(_options?): Promise<{
  integrityBreaks: any[];
  missingLogs: any[];
  tamperedLogs: any[];
  totalLogs: number;
  verified: boolean;
  verifiedLogs: number;
}>;
```

Verify log integrity

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `_options?` | \{ \} |

#### Returns

`Promise`\<\{
`integrityBreaks`: `any`[];
`missingLogs`: `any`[];
`tamperedLogs`: `any`[];
`totalLogs`: `number`;
`verified`: `boolean`;
`verifiedLogs`: `number`;
\}\>
