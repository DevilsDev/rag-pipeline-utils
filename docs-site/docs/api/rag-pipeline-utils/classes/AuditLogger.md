---
mdx:
  format: md
---

# Class: AuditLogger

Records authentication, data access, data change and other audit events
in hash-chained logs, with querying, compliance reports and an integrity
check.

## Extends

- `EventEmitter`

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

`EventEmitter.constructor`

## Properties

| Property                                            | Type                                      | Description                                                    |
| --------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| <a id="property-droppedevents"></a> `droppedEvents` | `number`                                  | Events discarded by memoryLimit so far (see 'events_dropped'). |
| <a id="property-encryptionkey"></a> `encryptionKey` | `string` \| `Buffer`\<`ArrayBufferLike`\> | -                                                              |
| <a id="property-flushtimer"></a> `flushTimer`       | `Timeout`                                 | -                                                              |
| <a id="property-logbuffer"></a> `logBuffer`         | `any`[]                                   | -                                                              |

## Accessors

### signingKey

#### Get Signature

```ts
get signingKey(): string | Buffer<ArrayBufferLike>;
```

The key for the integrity hashes and signatures: the signingKey option,
then RAG_AUDIT_SIGNING_KEY, then the key stored in
`logDir/integrity/signing.key`. Resolved on first use.

##### Returns

`string` \| `Buffer`\<`ArrayBufferLike`\>

#### Set Signature

```ts
set signingKey(key): void;
```

##### Parameters

| Parameter | Type                                      | Description |
| --------- | ----------------------------------------- | ----------- |
| `key`     | `string` \| `Buffer`\<`ArrayBufferLike`\> | -           |

##### Returns

`void`

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
  skippedLines: number;
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
`skippedLines`: `number`;
`total`: `number`;
\}\>

---

### verifyIntegrity()

```ts
verifyIntegrity(_options?): Promise<{
  integrityBreaks: any[];
  missingLogs: any[];
  otherKey: {
     count: number;
     ranges: any[];
  };
  secondWriter: any[];
  tamperedLogs: any[];
  totalLogs: number;
  unchained: {
     count: number;
     ranges: any[];
  };
  verified: boolean;
  verifiedLogs: number;
}>;
```

Verify log integrity.

Besides the per-record checks it reads the chain: every record carries its
sequence, a link to the previous record and a keyed hash over the whole
record, and the chain file holds the latest state.

- `integrityBreaks`: `{ file, line, sequence, reason }`, where reason is
  `edited`, `chain`, `order`, `tail`, `unparseable`, `chain file missing`,
  `chain file reset` or `chain file forged`.
- `missingLogs`: gaps in the sequence, `{ after, before, count }`.
- `unchained`: records written before chain links existed (counted, and
  they do not make `verified` false).
- `otherKey`: records written with another signing key; they can't be
  checked, so `verified` is false.
- `secondWriter`: duplicate or interleaved sequences that look like two
  writers on one log directory. A break is only reported here when every
  record involved verifies and every interleaved run links up on its own;
  otherwise it is reported as the tampering it may be.

#### Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `_options?` | \{ \} |

#### Returns

`Promise`\<\{
`integrityBreaks`: `any`[];
`missingLogs`: `any`[];
`otherKey`: \{
`count`: `number`;
`ranges`: `any`[];
\};
`secondWriter`: `any`[];
`tamperedLogs`: `any`[];
`totalLogs`: `number`;
`unchained`: \{
`count`: `number`;
`ranges`: `any`[];
\};
`verified`: `boolean`;
`verifiedLogs`: `number`;
\}\>
