---
mdx:
  format: md
---

# rag-pipeline-utils

RAG Pipeline Utils - TypeScript Definitions

## Namespaces

- [errorFormatter](namespaces/errorFormatter/index.md)
- [eventLogger](namespaces/eventLogger/index.md)
- [logger](namespaces/logger/index.md)
- [metrics](namespaces/metrics/index.md)
- [ParallelProcessor](namespaces/ParallelProcessor/index.md)

## Classes

- [AgenticPipeline](classes/AgenticPipeline.md)
- [AnthropicConnector](classes/AnthropicConnector.md)
- [AuditLogger](classes/AuditLogger.md)
- [BaseConnector](classes/BaseConnector.md)
- [BatchProcessor](classes/BatchProcessor.md)
- [BM25Search](classes/BM25Search.md)
- [CascadeReranker](classes/CascadeReranker.md)
- [ChunkingEngine](classes/ChunkingEngine.md)
- [CitationTracker](classes/CitationTracker.md)
- [CohereConnector](classes/CohereConnector.md)
- [ConnectionPoolManager](classes/ConnectionPoolManager.md)
- [CostCalculator](classes/CostCalculator.md)
- [CostTracker](classes/CostTracker.md)
- [DAGEngine](classes/DAGEngine.md)
- [DashboardGenerator](classes/DashboardGenerator.md)
- [DevServer](classes/DevServer.md)
- [EmbeddingReranker](classes/EmbeddingReranker.md)
- [EntityExtractor](classes/EntityExtractor.md)
- [ExecutionTracer](classes/ExecutionTracer.md)
- [FileVectorStore](classes/FileVectorStore.md)
- [GraphIndex](classes/GraphIndex.md)
- [GraphRetriever](classes/GraphRetriever.md)
- [GuardrailsPipeline](classes/GuardrailsPipeline.md)
- [HotReloadManager](classes/HotReloadManager.md)
- [HybridRetriever](classes/HybridRetriever.md)
- [IterativeRetriever](classes/IterativeRetriever.md)
- [JWTValidator](classes/JWTValidator.md)
- [KnowledgeGraph](classes/KnowledgeGraph.md)
- [LocalEmbedder](classes/LocalEmbedder.md)
- [MCPServer](classes/MCPServer.md)
- [MCPToolBuilder](classes/MCPToolBuilder.md)
- [MemoryCache](classes/MemoryCache.md)
- [MemoryRetriever](classes/MemoryRetriever.md)
- [MetricsAggregator](classes/MetricsAggregator.md)
- [OllamaConnector](classes/OllamaConnector.md)
- [OpenAIConnector](classes/OpenAIConnector.md)
- [PgVectorRetriever](classes/PgVectorRetriever.md)
- [PipelineEvaluator](classes/PipelineEvaluator.md)
- [PluginAnalytics](classes/PluginAnalytics.md)
- [PluginAnalyticsDashboard](classes/PluginAnalyticsDashboard.md)
- [PluginHub](classes/PluginHub.md)
- [PluginSignatureVerifier](classes/PluginSignatureVerifier.md)
- [PostGenerationGuard](classes/PostGenerationGuard.md)
- [PreRetrievalGuard](classes/PreRetrievalGuard.md)
- [ProjectScaffolder](classes/ProjectScaffolder.md)
- [QdrantRetriever](classes/QdrantRetriever.md)
- [QueryPlanner](classes/QueryPlanner.md)
- [RateLimiter](classes/RateLimiter.md)
- [RedisCache](classes/RedisCache.md)
- [RetrievalGuard](classes/RetrievalGuard.md)
- [ScoringReranker](classes/ScoringReranker.md)
- [SelfCritiqueChecker](classes/SelfCritiqueChecker.md)
- [SSEAdapter](classes/SSEAdapter.md)
- [StreamingEmbedder](classes/StreamingEmbedder.md)
- [StreamRouter](classes/StreamRouter.md)
- [TemplateRegistry](classes/TemplateRegistry.md)
- [TokenBudget](classes/TokenBudget.md)
- [TraceInspector](classes/TraceInspector.md)
- [WebSocketAdapter](classes/WebSocketAdapter.md)

## Interfaces

- [CacheBackend](interfaces/CacheBackend.md)
- [CacheLayerStats](interfaces/CacheLayerStats.md)
- [CacheOptions](interfaces/CacheOptions.md)
- [~~DAGNode~~](interfaces/DAGNode.md)
- [~~DAGOptions~~](interfaces/DAGOptions.md)
- [Document](interfaces/Document.md)
- [EmbedderPlugin](interfaces/EmbedderPlugin.md)
- [EnhancedError](interfaces/EnhancedError.md)
- [~~ErrorFormatter~~](interfaces/ErrorFormatter.md)
- [~~EvalResult~~](interfaces/EvalResult.md)
- [LLMPlugin](interfaces/LLMPlugin.md)
- [~~LLMResponse~~](interfaces/LLMResponse.md)
- [~~LoadConfigOptions~~](interfaces/LoadConfigOptions.md)
- [LoaderPlugin](interfaces/LoaderPlugin.md)
- [Logger](interfaces/Logger.md)
- [Pipeline](interfaces/Pipeline.md)
- [PipelineRunOptions](interfaces/PipelineRunOptions.md)
- [PipelineRunResult](interfaces/PipelineRunResult.md)
- [PluginRegistry](interfaces/PluginRegistry.md)
- [RagPipelineConfig](interfaces/RagPipelineConfig.md)
- [RerankerPlugin](interfaces/RerankerPlugin.md)
- [RetrieveOptions](interfaces/RetrieveOptions.md)
- [RetrieverPlugin](interfaces/RetrieverPlugin.md)
- [SearchResult](interfaces/SearchResult.md)
- [StreamChunk](interfaces/StreamChunk.md)

## Type Aliases

- [CacheOutcome](type-aliases/CacheOutcome.md)
- [EmbeddingOutput](type-aliases/EmbeddingOutput.md)

## Variables

- [ERROR_CODES](variables/ERROR_CODES.md)
- [pluginRegistry](variables/pluginRegistry.md)
- [PRICING_METADATA](variables/PRICING_METADATA.md)

## Functions

- [buildIDFWeights](functions/buildIDFWeights.md)
- [checkAnswer](functions/checkAnswer.md)
- [checkNumericConsistency](functions/checkNumericConsistency.md)
- [compareConfigurations](functions/compareConfigurations.md)
- [computeAnswerRelevance](functions/computeAnswerRelevance.md)
- [computeBLEU](functions/computeBLEU.md)
- [computeContextPrecision](functions/computeContextPrecision.md)
- [computeContextRecall](functions/computeContextRecall.md)
- [computeFaithfulness](functions/computeFaithfulness.md)
- [computeGroundedness](functions/computeGroundedness.md)
- [computeROUGE](functions/computeROUGE.md)
- [computeSemanticSimilarity](functions/computeSemanticSimilarity.md)
- [createAiSdkAdapter](functions/createAiSdkAdapter.md)
- [createDevServer](functions/createDevServer.md)
- [createEmbeddingStream](functions/createEmbeddingStream.md)
- [createError](functions/createError.md)
- [createHotReloadManager](functions/createHotReloadManager.md)
- [createRagPipeline](functions/createRagPipeline.md)
- [detectHallucinations](functions/detectHallucinations.md)
- [detectInjection](functions/detectInjection.md)
- [evaluateRagDataset](functions/evaluateRagDataset.md)
- [evaluationVerdict](functions/evaluationVerdict.md)
- [extractNumbers](functions/extractNumbers.md)
- [generateSyntheticDataset](functions/generateSyntheticDataset.md)
- [loadConfig](functions/loadConfig.md)
- [mapSentenceToSources](functions/mapSentenceToSources.md)
- [normalizeConfig](functions/normalizeConfig.md)
- [normalizeSources](functions/normalizeSources.md)
- [reciprocalRankFusion](functions/reciprocalRankFusion.md)
- [renderEvaluationReport](functions/renderEvaluationReport.md)
- [retry](functions/retry.md)
- [runEvaluation](functions/runEvaluation.md)
- [scoreAnswer](functions/scoreAnswer.md)
- [validateDataset](functions/validateDataset.md)
- [validateInput](functions/validateInput.md)
- [validatePlugin](functions/validatePlugin.md)
- [validateRagrc](functions/validateRagrc.md)
- [withRetry](functions/withRetry.md)
- [wrapError](functions/wrapError.md)

## References

### createPipeline

Renames and re-exports [createRagPipeline](functions/createRagPipeline.md)

---

### DAG

Renames and re-exports [DAGEngine](classes/DAGEngine.md)

---

### loadRagConfig

Renames and re-exports [loadConfig](functions/loadConfig.md)
