/**
 * Version: 0.1.0
 * Description: Schema validator for plugin._config.json
 * Author: Ali Kahwaji
 */

function validatePluginSchema(config) {
  const validTypes = ["loader", "embedder", "retriever", "llm"];
  const errors = [];

  for (const _type of Object.keys(config)) {
    if (!validTypes.includes(_type)) {
      errors.push(`Unknown plugin _type: ${_type}`);
      continue;
    }
    for (const [name, modulePath] of Object.entries(config[_type])) {
      if (typeof name !== "string" || typeof modulePath !== "string") {
        errors.push(
          `Invalid plugin definition for _type "${_type}" and name "${name}"`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Default export

module.exports = {
  validatePluginSchema,
};
