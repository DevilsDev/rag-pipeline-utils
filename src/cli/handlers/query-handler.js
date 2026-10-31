/**
 * Query command handler
 * Answers a question from the ingested index. Without an llm stage it prints
 * the retrieved passages instead of an answer.
 *
 * Options: --top-k, --json, --streaming, --timeout, --trace (per-stage
 * timings, and time to first token when streaming), --explain (passage scores and the passages supporting each
 * answer sentence), --stats (latency, estimated tokens and cost). The global
 * --quiet prints only the answer or the passages.
 */

const { loadCliConfig } = require("../shared/config-context.js");
const { query } = require("../services/rag-service.js");
const { CostCalculator } = require("../../cost/cost-calculator.js");

const STAGES = ["embed", "retrieve", "rerank", "generate"];

function sourceLabel(doc) {
  return doc.metadata?.source || doc.id;
}

function printPassages(results, { quiet } = {}) {
  // A score of 0 means no overlap with the question at all.
  const matches = results.filter((doc) => !(doc.score <= 0));
  if (matches.length === 0) {
    if (!quiet) console.log("No matching passages found.");
    return;
  }
  matches.forEach((doc, i) => {
    const score = typeof doc.score === "number" ? doc.score.toFixed(3) : "-";
    console.log(`\n[${i + 1}] ${sourceLabel(doc)} (score ${score})`);
    console.log(doc.content);
  });
}

/** Sum the recorded timings per stage. */
function stageTimings(timings) {
  const totals = {};
  for (const { stage, ms } of timings)
    totals[stage] = (totals[stage] || 0) + ms;
  return totals;
}

function printTrace(result) {
  const totals = stageTimings(result.timings);
  console.log("\nTrace");
  for (const stage of STAGES) {
    const ms = totals[stage];
    console.log(
      `  ${stage.padEnd(11)} ${ms === undefined ? "-" : `${ms.toFixed(1)} ms`}`,
    );
  }
  if (result.firstTokenMs != null) {
    console.log(
      `  ${"first token".padEnd(11)} ${result.firstTokenMs.toFixed(1)} ms`,
    );
  }
  console.log(`  ${"total".padEnd(11)} ${result.durationMs.toFixed(1)} ms`);
}

/** Rough token count: about 4 characters per token for English text. */
const estimateTokens = (text) => Math.ceil(String(text || "").length / 4);

function computeStats(result, question, llmModel) {
  const context = result.results.map((d) => d.content || "").join("\n");
  const stats = {
    durationMs: Math.round(result.durationMs),
    passages: result.results.length,
    answerChars: result.answer ? result.answer.length : 0,
  };
  if (result.answer !== null) {
    stats.estimatedInputTokens = estimateTokens(`${question}\n${context}`);
    stats.estimatedOutputTokens = estimateTokens(result.answer);
    const calculator = new CostCalculator();
    // Only price models in the table; unknown models would print a warning.
    if (llmModel && calculator.getModelPricing(llmModel)) {
      const cost = calculator.estimate(
        llmModel,
        stats.estimatedInputTokens,
        stats.estimatedOutputTokens,
      );
      stats.estimatedCostUsd = Number(cost.totalCost.toFixed(6));
      stats.model = cost.model;
    }
  }
  return stats;
}

function printStats(stats) {
  console.log("\nStats");
  console.log(`  latency   ${stats.durationMs} ms`);
  console.log(`  passages  ${stats.passages}`);
  if (stats.estimatedInputTokens !== undefined) {
    console.log(
      `  tokens    ~${stats.estimatedInputTokens} in, ~${stats.estimatedOutputTokens} out (estimated)`,
    );
  }
  if (stats.estimatedCostUsd !== undefined) {
    console.log(
      `  cost      ~$${stats.estimatedCostUsd} (${stats.model}, estimated)`,
    );
  }
}

/** Passage rank and score, and the passages that support each sentence. */
function explanation(result) {
  const passages = result.results.map((doc, i) => ({
    rank: i + 1,
    source: sourceLabel(doc),
    score: typeof doc.score === "number" ? doc.score : null,
  }));
  if (!result.citations) return { passages };
  const rankOf = new Map(result.results.map((d, i) => [String(d.id), i + 1]));
  const sentences = (result.citations.citations || []).map((c) => ({
    sentence: c.sentence,
    supportedBy: (c.sources || []).map((s) => ({
      rank: rankOf.get(String(s.docId)) ?? s.docIndex + 1,
      source: sourceLabel(result.results[s.docIndex] || { id: s.docId }),
      support: s.score,
    })),
  }));
  return {
    passages,
    sentences,
    groundedness: result.citations.groundednessScore,
  };
}

function printExplanation(explained) {
  console.log("\nExplanation");
  console.log("  Passages, in ranked order:");
  for (const p of explained.passages) {
    const score = p.score === null ? "-" : p.score.toFixed(3);
    console.log(`    [${p.rank}] ${p.source}  score ${score}`);
  }
  if (!explained.sentences) return;
  console.log("  Answer sentences:");
  for (const s of explained.sentences) {
    const support = s.supportedBy.length
      ? s.supportedBy
          .map((p) => `[${p.rank}] ${p.source} (${p.support.toFixed(2)})`)
          .join(", ")
      : "not supported by any passage";
    console.log(`    "${s.sentence}"`);
    console.log(`      -> ${support}`);
  }
  console.log(`  Groundedness: ${explained.groundedness.toFixed(2)}`);
}

/**
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {string} question - Query text
 * @param {object} options - Command-specific options
 */
async function handleQuery(globalOptions, question, options = {}) {
  try {
    const { config, configDir } = loadCliConfig(globalOptions);
    const topK = options.topK || 3;
    const quiet = Boolean(globalOptions.quiet);

    if (globalOptions.dryRun) {
      console.log(`🧪 Dry run: would query the index for: ${question}`);
      return;
    }

    const hasLlm = (config.pipeline || []).some((s) => s.stage === "llm");
    const streaming = Boolean(options.streaming && hasLlm && !options.json);
    if (options.streaming && !hasLlm && !quiet && !options.json) {
      console.log("--streaming needs an llm stage; showing passages instead.");
    }

    const result = await query({
      config,
      configDir,
      question,
      topK,
      timeout: options.timeout,
      ...(streaming && { onToken: (t) => process.stdout.write(t) }),
    });

    const llmStage = (config.pipeline || []).find((s) => s.stage === "llm");
    const stats = options.stats
      ? computeStats(result, question, llmStage?.config?.model)
      : undefined;
    const explained = options.explain ? explanation(result) : undefined;

    if (options.json) {
      const { timings, durationMs, ...rest } = result;
      console.log(
        JSON.stringify(
          {
            ...rest,
            ...(options.trace && {
              trace: { stages: stageTimings(timings), totalMs: durationMs },
            }),
            ...(stats && { stats }),
            ...(explained && { explanation: explained }),
          },
          null,
          2,
        ),
      );
      return;
    }

    if (result.answer === null) {
      if (!quiet)
        console.log("No llm stage configured; showing retrieved passages.");
      printPassages(result.results, { quiet });
    } else {
      if (streaming) process.stdout.write("\n");
      else console.log(result.answer);
      if (!quiet) {
        console.log("\nSources:");
        printPassages(result.results);
      }
    }

    if (options.explain) printExplanation(explained);
    if (options.trace) printTrace(result);
    if (options.stats) printStats(stats);
  } catch (error) {
    console.error(`❌ Query failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { handleQuery, explanation, computeStats };
