/**
 * protectai/deberta-v3-base-prompt-injection-v2 as an injection detector,
 * run in-process with transformers.js (the model's ONNX export). The same
 * adapter is shown on the Guardrails docs page, so the published numbers
 * are for that code.
 *
 * Needs `npm install --no-save @huggingface/transformers` (`--no-save`
 * keeps package.json unchanged); it is not a dependency of the library or of
 * this repository. The model is 738 MB and is downloaded on first use into
 * transformers.js's cache.
 */

"use strict";

const MODEL = "protectai/deberta-v3-base-prompt-injection-v2";
const REVISION = "90c9989b1a342275dd0d1a95aad283c04e075671";

/**
 * @param {object} [options]
 * @param {number} [options.threshold=0.5] - INJECTION probability that flags
 * @param {string} [options.localModelPath] - Load from this folder (models/<id>/...) instead of downloading
 */
async function createInjectionClassifier({
  threshold = 0.5,
  localModelPath,
} = {}) {
  const { AutoTokenizer, AutoModelForSequenceClassification, env } =
    await import("@huggingface/transformers");
  if (localModelPath) {
    env.localModelPath = localModelPath;
    env.allowRemoteModels = false;
  }
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL, {
    revision: REVISION,
  });
  const model = await AutoModelForSequenceClassification.from_pretrained(
    MODEL,
    { revision: REVISION, dtype: "fp32" },
  );
  const injection = Number(
    Object.entries(model.config.id2label).find(
      ([, label]) => label === "INJECTION",
    )[0],
  );

  return {
    name: "deberta-injection",
    kind: "injection",
    async detect(text) {
      // The model reads at most 512 tokens; the rest of the text is unseen
      const inputs = await tokenizer(text, {
        truncation: true,
        max_length: 512,
      });
      const { logits } = await model(inputs);
      const values = Array.from(logits.data);
      const max = Math.max(...values);
      const exp = values.map((v) => Math.exp(v - max));
      const score = exp[injection] / exp.reduce((a, b) => a + b, 0);
      return { flagged: score > threshold, score };
    },
    info: {
      model: MODEL,
      revision: REVISION,
      threshold,
      maxTokens: 512,
      transformersJs: env.version,
    },
  };
}

module.exports = { createInjectionClassifier };
