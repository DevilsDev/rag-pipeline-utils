/**
 * Version: 0.1.0
 * Description: Schema validator for plugin.config.json
 * Author: Ali Kahwaji
 */

function validatePluginSchema(config) {
    const validTypes = ['loader', 'embedder', 'retriever', 'llm'];
    const errors = [];
  
    for (const type of Object.keys(config)) {
      if (!validTypes.includes(type)) {
        errors.push(`Unknown plugin type: ${type}`);
        continue;
      }
      for (const [name, modulePath] of Object.entries(config[type])) {
        if (typeof name !== 'string' || typeof modulePath !== 'string') {
          errors.push(`Invalid plugin definition for type "${type}" and name "${name}"`);
        }
      }
    }
  
    return {
      valid: errors.length === 0,
      errors
    };
  }
  

// Default export



module.exports = {
  validatePluginSchema
};