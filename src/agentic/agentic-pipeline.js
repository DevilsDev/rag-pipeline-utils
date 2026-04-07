"use strict";

const { EventEmitter } = require("events");
const { DAG } = require("../dag/dag-engine");
const { QueryPlanner } = require("./query-planner");
const { IterativeRetriever } = require("./iterative-retriever");
const { SelfCritiqueChecker } = require("./self-critique");

/**
 * Default configuration for the AgenticPipeline.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  maxConcurrency: 3,
  timeout: 60000,
  enablePlanning: true,
  enableCritique: true,
  enableIterativeRetrieval: false,
  maxIterations: 3,
  critiqueThreshold: 0.5,
};

/**
 * DAG-based agentic RAG orchestrator with two-phase execution:
 *   Phase 1 - Plan: decompose query into sub-queries
 *   Phase 2 - Execute: build DAG of retrieve -> merge -> (critique ->) generate
 *
 * @extends EventEmitter
 */
class AgenticPipeline extends EventEmitter {
  /**
   * @param {object} [options] - Override default configuration
   * @param {number} [options.maxConcurrency=3] - Max concurrent DAG node execution
   * @param {number} [options.timeout=60000] - Global timeout in ms
   * @param {boolean} [options.enablePlanning=true] - Whether to decompose queries
   * @param {boolean} [options.enableCritique=true] - Whether to self-critique answers
   * @param {boolean} [options.enableIterativeRetrieval=false] - Whether to use iterative retrieval
   * @param {number} [options.maxIterations=3] - Max iterations for iterative retrieval
   * @param {number} [options.critiqueThreshold=0.5] - Groundedness threshold for approval
   * @param {object} [options.plannerOptions] - Options forwarded to QueryPlanner
   * @param {object} [options.iterativeOptions] - Options forwarded to IterativeRetriever
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.planner = new QueryPlanner(options.plannerOptions);
    this.critiqueChecker = new SelfCritiqueChecker({
      approvalThreshold: this.config.critiqueThreshold,
    });
    if (this.config.enableIterativeRetrieval) {
      this.iterativeRetriever = new IterativeRetriever(
        options.iterativeOptions,
      );
    }
  }

  /**
   * Run the full agentic pipeline: plan -> retrieve -> merge -> (critique ->) generate.
   *
   * @param {object} params
   * @param {string} params.query - The user query
   * @param {object} params.retriever - Retriever instance with .retrieve() method
   * @param {object} params.llm - LLM instance with .generate() method
   * @param {Array<number>} [params.queryVector] - Optional pre-computed query vector
   * @param {object} [params.options={}] - Extra options passed to llm.generate()
   * @returns {Promise<{
   *   success: boolean,
   *   query: string,
   *   answer: string,
   *   results: Array<object>,
   *   critique: object|null,
   *   subQueries: Array<object>,
   *   metadata: object
   * }>}
   * @throws {Error} If retriever or llm is missing
   */
  async run({ query, retriever, llm, queryVector, options = {} }) {
    // 1. Validate inputs
    if (!retriever || typeof retriever.retrieve !== "function") {
      throw new Error(
        "AgenticPipeline.run(): retriever with .retrieve() method is required",
      );
    }
    if (!llm || typeof llm.generate !== "function") {
      throw new Error(
        "AgenticPipeline.run(): llm with .generate() method is required",
      );
    }
    if (!query || typeof query !== "string" || !query.trim()) {
      throw new Error(
        "AgenticPipeline.run(): query must be a non-empty string",
      );
    }

    // Phase 1: Plan
    let subQueries;
    if (this.config.enablePlanning) {
      const plan = this.planner.plan(query);
      subQueries = plan.subQueries;
      this.emit("planned", plan);
    } else {
      subQueries = [{ subQuery: query, strategy: "general", priority: 0 }];
    }

    // Phase 2: Build and execute DAG
    const dag = new DAG();

    // Add retrieve nodes (one per sub-query)
    for (let i = 0; i < subQueries.length; i++) {
      const sq = subQueries[i];
      dag.addNode(
        `retrieve-${i}`,
        async () => {
          if (this.iterativeRetriever) {
            const result = await this.iterativeRetriever.retrieve({
              query: sq.subQuery,
              retriever,
              llm,
              queryVector,
            });
            return result.results;
          }
          return await retriever.retrieve({
            query: sq.subQuery,
            queryVector,
            topK: 10,
          });
        },
        { timeout: this.config.timeout / 2, priority: sq.priority },
      );
    }

    // Add merge node
    dag.addNode("merge", async (inputs) => {
      const allResults = Array.isArray(inputs)
        ? inputs.flat()
        : [inputs].flat();
      // Deduplicate by id
      const seen = new Map();
      for (const r of allResults) {
        if (r == null) continue;
        const id = r?.id || JSON.stringify(r);
        if (!seen.has(id) || (r.score && r.score > (seen.get(id).score || 0))) {
          seen.set(id, r);
        }
      }
      return Array.from(seen.values());
    });

    // Connect retrieve nodes to merge
    for (let i = 0; i < subQueries.length; i++) {
      dag.connect(`retrieve-${i}`, "merge");
    }

    // Add critique + generate nodes
    if (this.config.enableCritique) {
      dag.addNode("pre-generate", async (mergedResults) => {
        // Generate initial answer for critique
        const answer = await llm.generate(query, mergedResults, options);
        const critique = this.critiqueChecker.check(
          String(answer),
          mergedResults,
        );
        this.emit("critiqued", critique);
        return { answer: String(answer), mergedResults, critique };
      });
      dag.connect("merge", "pre-generate");

      dag.addNode("generate", async ({ answer, mergedResults, critique }) => {
        if (critique.approved) {
          return { answer, results: mergedResults, critique };
        }
        // Re-generate with critique feedback
        const issueTexts = critique.issues.map(
          (i) => i.sentence || i.text || String(i),
        );
        const refinedPrompt = `${query}\n\nPrevious answer had issues: ${issueTexts.join("; ")}. Please provide a more grounded answer.`;
        const refinedAnswer = await llm.generate(
          refinedPrompt,
          mergedResults,
          options,
        );
        return {
          answer: String(refinedAnswer),
          results: mergedResults,
          critique,
        };
      });
      dag.connect("pre-generate", "generate");
    } else {
      dag.addNode("generate", async (mergedResults) => {
        const answer = await llm.generate(query, mergedResults, options);
        return { answer: String(answer), results: mergedResults };
      });
      dag.connect("merge", "generate");
    }

    // Execute DAG
    const nodeCount =
      subQueries.length + 2 + (this.config.enableCritique ? 1 : 0);
    this.emit("executing", { nodeCount });

    const dagResult = await dag.execute(query, {
      concurrency: this.config.maxConcurrency,
      timeout: this.config.timeout,
      continueOnError: true,
      gracefulDegradation: true,
    });

    // Extract final result from generate node
    const output = dagResult?.answer
      ? dagResult
      : dagResult?.get
        ? dagResult.get("generate")
        : dagResult;

    this.emit("completed", output);

    return {
      success: true,
      query,
      answer: output?.answer || "",
      results: output?.results || [],
      critique: output?.critique || null,
      subQueries,
      metadata: {
        subQueryCount: subQueries.length,
        enabledCritique: this.config.enableCritique,
        enabledIterative: this.config.enableIterativeRetrieval,
      },
    };
  }
}

module.exports = { AgenticPipeline, DEFAULT_CONFIG };
