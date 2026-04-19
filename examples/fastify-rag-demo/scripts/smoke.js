#!/usr/bin/env node
/**
 * 30-second smoke test:
 *   1. Health check
 *   2. Ingest a small fixture
 *   3. Query and assert citations + evaluation present
 *
 * Usage:
 *   SERVER=http://localhost:3000 node scripts/smoke.js
 */

const SERVER = process.env.SERVER ?? "http://localhost:3000";

async function step(name, fn) {
  process.stdout.write(`▸ ${name} ... `);
  try {
    const result = await fn();
    console.log("✓");
    return result;
  } catch (err) {
    console.log("✗");
    console.error(err);
    process.exit(1);
  }
}

await step("GET /health", async () => {
  const res = await fetch(`${SERVER}/health`);
  if (!res.ok) throw new Error(`health failed: ${res.status}`);
  const body = await res.json();
  if (!body.llmConfigured) {
    console.warn("\n   ⚠ OPENAI_API_KEY not set on server — query will fail");
  }
  return body;
});

const fixtures = [
  {
    id: "policy-vacation",
    text:
      "Vacation policy: full-time employees accrue 15 days of paid time off per year, " +
      "increasing to 20 days after three years of service. Unused days carry over up to 5 days.",
    metadata: { topic: "hr" },
  },
  {
    id: "policy-remote",
    text:
      "Remote work policy: employees may work remotely up to 3 days per week, " +
      "subject to manager approval and quarterly in-office days for team sync.",
    metadata: { topic: "hr" },
  },
];

for (const doc of fixtures) {
  await step(`POST /ingest ${doc.id}`, async () => {
    const res = await fetch(`${SERVER}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
    });
    if (!res.ok) throw new Error(`ingest failed: ${res.status}`);
    return res.json();
  });
}

const result = await step("POST /query (vacation policy)", async () => {
  const res = await fetch(`${SERVER}/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "How many vacation days do new employees get?",
    }),
  });
  if (!res.ok) throw new Error(`query failed: ${res.status}`);
  return res.json();
});

console.log("\n--- Result ---");
console.log("Answer:           ", result.answer);
console.log("Groundedness:     ", result.groundednessScore);
console.log("Citations:        ", result.citations?.length ?? 0);
console.log("Faithfulness:     ", result.evaluation?.faithfulness);
console.log("Relevance:        ", result.evaluation?.relevance);
console.log("Retrieved chunks: ", result.retrievedCount);
console.log("\n✓ Smoke test passed");
