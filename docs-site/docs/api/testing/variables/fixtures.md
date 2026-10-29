---
mdx:
  format: md
---

# Variable: fixtures

```ts
const fixtures: Readonly<{
  documents: readonly (
    | Readonly<{
        content: "Full-time employees receive twenty days of paid vacation per year. Unused days carry over to March.";
        id: "vacation";
        metadata: Readonly<{
          source: "vacation.md";
        }>;
      }>
    | Readonly<{
        content: "Employees may work remotely up to three days per week with manager approval.";
        id: "remote-work";
        metadata: Readonly<{
          source: "remote-work.md";
        }>;
      }>
    | Readonly<{
        content: "Submit receipts within thirty days. Travel above 500 EUR needs pre-approval from finance.";
        id: "expenses";
        metadata: Readonly<{
          source: "expenses.md";
        }>;
      }>
  )[];
}>;
```

Short documents for tests and examples.
