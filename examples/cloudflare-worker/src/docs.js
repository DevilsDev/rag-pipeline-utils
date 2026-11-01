/**
 * The documents the Worker answers from. Workers have no local disk to read
 * them from at runtime, so they are bundled with the code: replace these, or
 * load your own at build time.
 */
export const documents = [
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year. Unused days carry over until the end of March.",
    metadata: { source: "vacation.md" },
  },
  {
    id: "remote-work",
    content:
      "Employees may work remotely up to three days a week with manager approval. Core hours are 10:00 to 15:00.",
    metadata: { source: "remote-work.md" },
  },
  {
    id: "expenses",
    content:
      "Submit receipts within thirty days. Meals while travelling are reimbursed up to fifty dollars per day.",
    metadata: { source: "expenses.md" },
  },
];
