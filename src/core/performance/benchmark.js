/**
 * Benchmark tooling for measuring RAG pipeline performance
 * Provides detailed timing and performance metrics for each stage
 */

const path = require("path");
const { logger } = require("../../utils/structured-logger.js");

/**
 * Performance timer utility
 */
class PerformanceTimer {
  constructor() {
    this.timers = new Map();
    this.results = new Map();
  }

  /**
   * Start timing an operation
   * @param {string} name - Timer name
   * @param {object} metadata - Additional metadata
   */
  start(name, metadata = {}) {
    this.timers.set(name, {
      startTime: performance.now(),
      startMemory: process.memoryUsage(),
      metadata,
    });
  }

  /**
   * End timing an operation
   * @param {string} name - Timer name
   * @param {object} result - Operation result metadata
   */
  end(name, result = {}) {
    const timer = this.timers.get(name);
    if (!timer) {
      throw new Error(`Timer '${name}' not found. Did you call start() first?`);
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage();

    const timing = {
      duration: endTime - timer.startTime,
      startTime: timer.startTime,
      endTime,
      memoryDelta: {
        heapUsed: endMemory.heapUsed - timer.startMemory.heapUsed,
        heapTotal: endMemory.heapTotal - timer.startMemory.heapTotal,
        external: endMemory.external - timer.startMemory.external,
      },
      metadata: timer.metadata,
      result,
    };

    this.results.set(name, timing);
    this.timers.delete(name);

    return timing;
  }

  /**
   * Get timing result
   * @param {string} name - Timer name
   * @returns {object} Timing result
   */
  getResult(name) {
    return this.results.get(name);
  }

  /**
   * Get all results
   * @returns {Map} All timing results
   */
  getAllResults() {
    return new Map(this.results);
  }

  /**
   * Clear all results
   */
  clear() {
    this.timers.clear();
    this.results.clear();
  }
}

/**
 * Pipeline benchmark runner
 */
class PipelineBenchmark {
  constructor(pipeline, options = {}) {
    this.pipeline = pipeline;
    this.timer = new PerformanceTimer();
    this.options = {
      includeMemory: options.includeMemory !== false,
      includeGC: options.includeGC !== false,
      warmupRuns: options.warmupRuns || 0,
      iterations: options.iterations || 1,
      concurrency: options.concurrency || 1,
      timeout: options.timeout || 30000,
      ...options,
    };
  }

  /**
   * Benchmark the ingest operation
   * @param {string} docPath - Document path
   * @returns {Promise<object>} Benchmark results
   */
  async benchmarkIngest(docPath) {
    logger.info("Benchmarking ingest operation", { docPath });

    // Warmup runs
    for (let i = 0; i < this.options.warmupRuns; i++) {
      logger.info("Warmup run", { run: i + 1, total: this.options.warmupRuns });
      await this.runIngestBenchmark(docPath, true);
    }

    // Actual benchmark runs
    const results = [];
    for (let i = 0; i < this.options.iterations; i++) {
      logger.info("Benchmark run", {
        run: i + 1,
        total: this.options.iterations,
      });
      const result = await this.runIngestBenchmark(docPath, false);
      results.push(result);
    }

    return this.aggregateResults("ingest", results);
  }

  /**
   * Run a single ingest benchmark
   * @param {string} docPath - Document path
   * @param {boolean} isWarmup - Whether this is a warmup run
   * @returns {Promise<object>} Single run results
   */
  async runIngestBenchmark(docPath, isWarmup = false) {
    this.timer.clear();

    try {
      // Overall ingest timing
      this.timer.start("ingest_total", { docPath, isWarmup });

      // Stage 1: Document loading
      this.timer.start("loader", { stage: "load", docPath });
      const documents = await this.pipeline.loaderInstance.load(docPath);
      const loadResult = this.timer.end("loader", {
        documentCount: documents.length,
        totalSize: documents.reduce(
          (sum, doc) => sum + (doc.content?.length || 0),
          0,
        ),
      });

      // Stage 2: Chunking
      this.timer.start("chunker", {
        stage: "chunk",
        documentCount: documents.length,
      });
      const chunks = documents.flatMap((doc) => doc.chunk());
      const chunkResult = this.timer.end("chunker", {
        chunkCount: chunks.length,
        avgChunkSize:
          chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length,
      });

      // Stage 3: Embedding
      this.timer.start("embedder", {
        stage: "embed",
        chunkCount: chunks.length,
      });
      const vectors = await this.pipeline.embedderInstance.embed(chunks);
      const embedResult = this.timer.end("embedder", {
        vectorCount: vectors.length,
        vectorDimension: vectors[0]?.length || 0,
        throughput: chunks.length / (loadResult.duration / 1000), // chunks per second
      });

      // Stage 4: Storage
      this.timer.start("retriever_store", {
        stage: "store",
        vectorCount: vectors.length,
      });
      await this.pipeline.retrieverInstance.store(vectors);
      const storeResult = this.timer.end("retriever_store", {
        vectorCount: vectors.length,
      });

      // End overall timing
      const totalResult = this.timer.end("ingest_total", {
        success: true,
        documentCount: documents.length,
        chunkCount: chunks.length,
        vectorCount: vectors.length,
      });

      return {
        success: true,
        stages: {
          load: loadResult,
          chunk: chunkResult,
          embed: embedResult,
          store: storeResult,
        },
        total: totalResult,
        metadata: {
          docPath,
          isWarmup,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const totalResult = this.timer.end("ingest_total", {
        success: false,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        total: totalResult,
        stages: Object.fromEntries(this.timer.getAllResults()),
        metadata: {
          docPath,
          isWarmup,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Benchmark the query operation
   * @param {string} prompt - Query prompt
   * @returns {Promise<object>} Benchmark results
   */
  async benchmarkQuery(prompt) {
    logger.info("Benchmarking query operation", {
      promptPreview: prompt.substring(0, 50),
    });

    // Warmup runs
    for (let i = 0; i < this.options.warmupRuns; i++) {
      logger.info("Warmup run", { run: i + 1, total: this.options.warmupRuns });
      await this.runQueryBenchmark(prompt, true);
    }

    // Actual benchmark runs
    const results = [];
    for (let i = 0; i < this.options.iterations; i++) {
      logger.info("Benchmark run", {
        run: i + 1,
        total: this.options.iterations,
      });
      const result = await this.runQueryBenchmark(prompt, false);
      results.push(result);
    }

    return this.aggregateResults("query", results);
  }

  /**
   * Run a single query benchmark
   * @param {string} prompt - Query prompt
   * @param {boolean} isWarmup - Whether this is a warmup run
   * @returns {Promise<object>} Single run results
   */
  async runQueryBenchmark(prompt, isWarmup = false) {
    this.timer.clear();

    try {
      // Overall query timing
      this.timer.start("query_total", {
        prompt: prompt.substring(0, 100),
        isWarmup,
      });

      // Stage 1: Query embedding
      this.timer.start("embedder_query", {
        stage: "embed_query",
        promptLength: prompt.length,
      });
      const queryVector =
        await this.pipeline.embedderInstance.embedQuery(prompt);
      const embedResult = this.timer.end("embedder_query", {
        vectorDimension: queryVector.length,
      });

      // Stage 2: Retrieval
      this.timer.start("retriever_search", {
        stage: "retrieve",
        vectorDimension: queryVector.length,
      });
      let retrieved =
        await this.pipeline.retrieverInstance.retrieve(queryVector);
      const retrieveResult = this.timer.end("retriever_search", {
        retrievedCount: retrieved.length,
      });

      // Stage 3: Reranking (if enabled)
      let rerankResult = null;
      if (this.pipeline.rerankerInstance) {
        this.timer.start("reranker", {
          stage: "rerank",
          documentCount: retrieved.length,
        });
        retrieved = await this.pipeline.rerankerInstance.rerank(
          prompt,
          retrieved,
        );
        rerankResult = this.timer.end("reranker", {
          rerankedCount: retrieved.length,
        });
      }

      // Stage 4: LLM Generation
      this.timer.start("llm_generate", {
        stage: "generate",
        promptLength: prompt.length,
        contextCount: retrieved.length,
      });
      const result = await this.pipeline.llmInstance.generate(
        prompt,
        retrieved,
      );
      const generateResult = this.timer.end("llm_generate", {
        responseLength: result.length,
        estimatedTokens: Math.ceil(result.length / 4), // Rough token estimate
      });

      // End overall timing
      const totalResult = this.timer.end("query_total", {
        success: true,
        promptLength: prompt.length,
        responseLength: result.length,
        retrievedCount: retrieved.length,
      });

      const stages = {
        embed: embedResult,
        retrieve: retrieveResult,
        generate: generateResult,
      };

      if (rerankResult) {
        stages.rerank = rerankResult;
      }

      return {
        success: true,
        stages,
        total: totalResult,
        result,
        metadata: {
          prompt: prompt.substring(0, 100),
          isWarmup,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const totalResult = this.timer.end("query_total", {
        success: false,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        total: totalResult,
        stages: Object.fromEntries(this.timer.getAllResults()),
        metadata: {
          prompt: prompt.substring(0, 100),
          isWarmup,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Aggregate results from multiple runs
   * @param {string} operation - Operation name
   * @param {object[]} results - Array of run results
   * @returns {object} Aggregated results
   */
  aggregateResults(operation, results) {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (successful.length === 0) {
      return {
        operation,
        success: false,
        error: "All benchmark runs failed",
        runs: {
          failed: failed.length,
          total: results.length,
        },
      };
    }

    // Aggregate stage timings
    const stageStats = {};
    const stageNames = Object.keys(successful[0].stages);

    for (const stageName of stageNames) {
      const stageDurations = successful
        .map((r) => r.stages[stageName]?.duration)
        .filter((d) => d !== undefined);

      if (stageDurations.length > 0) {
        stageStats[stageName] = this.calculateStats(stageDurations);
      }
    }

    // Aggregate total timings
    const totalDurations = successful.map((r) => r.total.duration);
    const totalStats = this.calculateStats(totalDurations);

    return {
      operation,
      success: true,
      runs: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
      },
      timing: {
        stages: stageStats,
        total: totalStats,
      },
      metadata: {
        iterations: this.options.iterations,
        warmupRuns: this.options.warmupRuns,
        timestamp: new Date().toISOString(),
      },
      rawResults: successful,
    };
  }

  /**
   * Calculate statistical measures for an array of values
   * @param {number[]} values - Array of numeric values
   * @returns {object} Statistical measures
   */
  calculateStats(values) {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      mean: mean,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      stdDev: Math.sqrt(
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
          values.length,
      ),
      count: values.length,
    };
  }

  /**
   * Format benchmark results for display
   * @param {object} results - Benchmark results
   * @returns {string} Formatted output
   */
  formatResults(results) {
    if (!results.success) {
      return `❌ Benchmark failed: ${results.error}`;
    }

    let output = `\n📊 ${results.operation.toUpperCase()} BENCHMARK RESULTS\n`;
    output += `${"=".repeat(50)}\n`;
    output += `Runs: ${results.runs.successful}/${results.runs.total} successful\n`;

    if (results.runs.failed > 0) {
      output += `⚠️  ${results.runs.failed} runs failed\n`;
    }

    output += "\n⏱️  STAGE TIMINGS (ms)\n";
    output += `${"-".repeat(30)}\n`;

    for (const [stage, stats] of Object.entries(results.timing.stages)) {
      output += `${stage.padEnd(15)} | `;
      output += `avg: ${stats.mean.toFixed(1).padStart(6)} | `;
      output += `min: ${stats.min.toFixed(1).padStart(6)} | `;
      output += `max: ${stats.max.toFixed(1).padStart(6)} | `;
      output += `p95: ${stats.p95.toFixed(1).padStart(6)}\n`;
    }

    output += `${"-".repeat(30)}\n`;
    output += "TOTAL          | ";
    output += `avg: ${results.timing.total.mean.toFixed(1).padStart(6)} | `;
    output += `min: ${results.timing.total.min.toFixed(1).padStart(6)} | `;
    output += `max: ${results.timing.total.max.toFixed(1).padStart(6)} | `;
    output += `p95: ${results.timing.total.p95.toFixed(1).padStart(6)}\n`;

    return output;
  }
}

module.exports = {
  PipelineBenchmark,
  PerformanceTimer,
};
