/**
 * Configuration Normalization - Unifies config shape and validation
 * Handles pipeline object/array conversion and default namespace assignment
 */

function normalizeConfig(cfg) {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    throw new TypeError("Configuration must be a non-null object");
  }

  // Default namespace
  const namespace = cfg.namespace || "default";

  // Canonical pipeline: array of { stage, name, ...opts }
  // Accept legacy object form like:
  // { pipeline: { loader:{name:'x'}, embedder:{name:'y'} } }
  // and modern array form:
  // { pipeline: [{stage:'loader', name:'x'}] }
  const legacy =
    cfg.pipeline &&
    !Array.isArray(cfg.pipeline) &&
    typeof cfg.pipeline === "object";
  const modern = Array.isArray(cfg.pipeline);

  let pipeline = [];
  if (modern) {
    pipeline = cfg.pipeline
      .filter(Boolean)
      .map((p) => ({
        stage: p.stage,
        name: p.name,
        ...(p.options || {}),
      }))
      .filter((p) => typeof p.stage === "string" && typeof p.name === "string");
  } else if (legacy) {
    const order = ["loader", "embedder", "retriever", "reranker", "llm"];
    for (const stage of order) {
      const entry = cfg.pipeline[stage];
      if (
        entry &&
        typeof entry === "object" &&
        typeof entry.name === "string"
      ) {
        pipeline.push({ stage, name: entry.name, ...(entry.options || {}) });
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
  const known = ["cache", "limits", "plugins", "observability", "storage"];
  for (const k of known) if (k in cfg) out[k] = cfg[k];

  return out;
}

module.exports = { normalizeConfig };
