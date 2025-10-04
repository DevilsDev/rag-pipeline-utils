/**
 * Configuration Normalization - Unifies config shape and validation
 * Handles pipeline object/array conversion and default namespace assignment
 */

function normalizeConfig(cfg) {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    throw new TypeError("Configuration must be a non-null object");
  }

  // Track validation warnings for invalid entries that get filtered out
  const warnings = [];

  // Default namespace
  const namespace = cfg.namespace || "default";

  // Canonical pipeline: array of { stage, name, ...opts }
  // Accept legacy object form like:
  // { pipeline: { loader:{name:'x'}, embedder:{name:'y'} } }
  // { plugins: { loader:'file-loader', embedder:'openai-embedder' } }
  // and modern array form:
  // { pipeline: [{stage:'loader', name:'x'}] }
  const legacy =
    (cfg.pipeline &&
      !Array.isArray(cfg.pipeline) &&
      typeof cfg.pipeline === "object") ||
    (cfg.plugins && typeof cfg.plugins === "object");
  const modern = Array.isArray(cfg.pipeline);

  let pipeline = [];
  if (modern) {
    pipeline = cfg.pipeline
      .filter(Boolean)
      .map((p) => {
        const entry = { stage: p.stage, name: p.name };
        if (p.version) entry.version = p.version;
        if (p.config) entry.config = p.config;
        if (p.options) Object.assign(entry, p.options);
        return entry;
      })
      .filter((p) => typeof p.stage === "string" && typeof p.name === "string");
  } else if (legacy) {
    const order = ["loader", "embedder", "retriever", "reranker", "llm"];
    const source = cfg.pipeline || cfg.plugins;

    for (const stage of order) {
      const entry = source[stage];
      if (entry) {
        if (typeof entry === "string") {
          // Simple format: { plugins: { loader: 'file-loader' } }
          pipeline.push({ stage, name: entry });
        } else if (
          entry &&
          typeof entry === "object" &&
          typeof entry.name === "string"
        ) {
          // Complex format: { pipeline: { loader: { name: 'file-loader', version: '1.0.0', config: {}, options: {} } } }
          const pipelineEntry = { stage, name: entry.name };
          if (entry.version) pipelineEntry.version = entry.version;
          if (entry.config) pipelineEntry.config = entry.config;
          if (entry.options) Object.assign(pipelineEntry, entry.options);
          pipeline.push(pipelineEntry);
        } else if (entry && typeof entry === "object") {
          // Invalid entry - has object but invalid name
          if (typeof entry.name !== "string") {
            warnings.push(
              `Invalid ${stage} plugin name: expected string, got ${typeof entry.name}`,
            );
          }
        }
      }
    }
  }

  // Ensure at least handles loader/embedder for legacy tests
  // (empty array is allowed but tests expect 2 when legacy provided)
  const metadata =
    cfg.metadata && typeof cfg.metadata === "object" ? cfg.metadata : {};

  const out = {
    namespace,
    metadata,
    pipeline,
  };

  // Preserve known top-level fields (non-breaking)
  const known = [
    "cache",
    "limits",
    "plugins",
    "observability",
    "storage",
    "performance",
  ];
  for (const k of known) if (k in cfg) out[k] = cfg[k];

  // Add warnings if any invalid entries were encountered
  if (warnings.length > 0) {
    out._warnings = warnings;
  }

  return out;
}

module.exports = { normalizeConfig };
