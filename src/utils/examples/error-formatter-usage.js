'use strict';

/**
 * Error Formatter Usage Examples
 *
 * Demonstrates how to use the enhanced error formatter
 * throughout the codebase
 */

const {
  createError,
  wrapError,
  formatErrorMessage,
  logError,
  ERROR_CODES,
} = require('../error-formatter');

// ============================================================================
// Example 1: Basic Error Creation
// ============================================================================

function basicErrorExample() {
  console.log('\n=== Example 1: Basic Error Creation ===\n');

  try {
    throw createError(ERROR_CODES.CONFIG_NOT_FOUND, {
      path: '.ragrc.json',
    });
  } catch (error) {
    console.log(formatErrorMessage(error));
  }
}

// ============================================================================
// Example 2: Error with Rich Context
// ============================================================================

function richContextExample() {
  console.log('\n=== Example 2: Error with Rich Context ===\n');

  try {
    const input = { invalid: 'data' };

    throw createError(ERROR_CODES.PLUGIN_EXECUTION_FAILED, {
      plugin: 'embedder-openai',
      reason: 'Invalid API key',
      input: JSON.stringify(input),
      details: 'Check your OPENAI_API_KEY environment variable',
    });
  } catch (error) {
    console.log(
      formatErrorMessage(error, {
        includeContext: true,
        includeSuggestions: true,
        includeDocumentation: true,
      }),
    );
  }
}

// ============================================================================
// Example 3: Wrapping Existing Errors
// ============================================================================

function wrapErrorExample() {
  console.log('\n=== Example 3: Wrapping Existing Errors ===\n');

  try {
    try {
      // Simulate file read error
      throw new Error('ENOENT: no such file or directory');
    } catch (originalError) {
      throw wrapError(originalError, ERROR_CODES.FS_FILE_NOT_FOUND, {
        path: '/path/to/config.json',
      });
    }
  } catch (error) {
    console.log(
      formatErrorMessage(error, {
        includeStack: false,
      }),
    );
  }
}

// ============================================================================
// Example 4: Configuration Errors
// ============================================================================

function configErrorExample() {
  console.log('\n=== Example 4: Configuration Errors ===\n');

  try {
    throw createError(ERROR_CODES.CONFIG_INVALID_TYPE, {
      field: 'pipeline.stages',
      expected: 'array',
      actual: 'string',
      currentValue: '"fetch,process,store"',
    });
  } catch (error) {
    console.log(formatErrorMessage(error));
  }
}

// ============================================================================
// Example 5: Plugin Contract Violation
// ============================================================================

function pluginContractExample() {
  console.log('\n=== Example 5: Plugin Contract Violation ===\n');

  try {
    throw createError(ERROR_CODES.PLUGIN_CONTRACT_VIOLATION, {
      plugin: 'my-custom-plugin',
      violation: 'Missing execute() method',
      missingMethod: 'execute',
      expectedType: 'function',
    });
  } catch (error) {
    console.log(formatErrorMessage(error));
  }
}

// ============================================================================
// Example 6: Pipeline Execution Error
// ============================================================================

function pipelineErrorExample() {
  console.log('\n=== Example 6: Pipeline Execution Error ===\n');

  try {
    throw createError(ERROR_CODES.PIPELINE_STAGE_FAILED, {
      stage: 'embedding',
      reason: 'API rate limit exceeded',
      input: JSON.stringify({ text: 'Sample text...' }).slice(0, 50),
    });
  } catch (error) {
    // Log with appropriate severity
    logError(error);
  }
}

// ============================================================================
// Example 7: Validation Error with Multiple Issues
// ============================================================================

function validationErrorExample() {
  console.log('\n=== Example 7: Validation Error ===\n');

  try {
    const errors = [
      { field: 'metadata.name', message: 'Required field missing' },
      { field: 'pipeline.stages', message: 'Must be an array' },
    ];

    throw createError(ERROR_CODES.VALIDATION_FAILED, {
      reason: 'Configuration validation failed',
      errors: JSON.stringify(errors, null, 2),
    });
  } catch (error) {
    console.log(
      formatErrorMessage(error, {
        includeContext: true,
      }),
    );
  }
}

// ============================================================================
// Example 8: Hot Reload Error
// ============================================================================

function hotReloadErrorExample() {
  console.log('\n=== Example 8: Hot Reload Error ===\n');

  try {
    throw createError(ERROR_CODES.HOT_RELOAD_FAILED, {
      path: './src/plugins/my-plugin.js',
      reason: 'SyntaxError: Unexpected token',
      watchPaths: './src/plugins, ./src/mocks',
    });
  } catch (error) {
    console.log(formatErrorMessage(error));
  }
}

// ============================================================================
// Example 9: DAG Cycle Detection
// ============================================================================

function dagCycleExample() {
  console.log('\n=== Example 9: DAG Cycle Detection ===\n');

  try {
    throw createError(ERROR_CODES.DAG_CYCLE_DETECTED, {
      cycle: 'A -> B -> C -> A',
    });
  } catch (error) {
    console.log(formatErrorMessage(error));
  }
}

// ============================================================================
// Example 10: Authentication Error
// ============================================================================

function authErrorExample() {
  console.log('\n=== Example 10: Authentication Error ===\n');

  try {
    throw createError(ERROR_CODES.AUTH_TOKEN_EXPIRED, {
      expiredAt: new Date(Date.now() - 3600000).toISOString(),
    });
  } catch (error) {
    console.log(formatErrorMessage(error));
  }
}

// ============================================================================
// Example 11: Custom Error Handling in Try-Catch
// ============================================================================

async function asyncErrorHandlingExample() {
  console.log('\n=== Example 11: Async Error Handling ===\n');

  async function loadPlugin(name) {
    // Simulate plugin loading
    throw new Error(`Cannot find module '${name}'`);
  }

  try {
    await loadPlugin('@rag-pipeline/embedder-openai');
  } catch (error) {
    const enhanced = wrapError(error, ERROR_CODES.PLUGIN_LOAD_FAILED, {
      plugin: '@rag-pipeline/embedder-openai',
      path: './node_modules/@rag-pipeline/embedder-openai',
      reason: error.message,
    });

    console.log(formatErrorMessage(enhanced));
  }
}

// ============================================================================
// Example 12: Error Serialization for Logging
// ============================================================================

function serializationExample() {
  console.log('\n=== Example 12: Error Serialization ===\n');

  try {
    throw createError(ERROR_CODES.PLUGIN_NOT_FOUND, {
      plugin: 'my-plugin',
      path: './plugins/my-plugin.js',
    });
  } catch (error) {
    // Serialize for logging to external service
    const serialized = error.toJSON();
    console.log(JSON.stringify(serialized, null, 2));
  }
}

// ============================================================================
// Example 13: Custom Error Formatting
// ============================================================================

function customFormattingExample() {
  console.log('\n=== Example 13: Custom Formatting ===\n');

  try {
    throw createError(ERROR_CODES.CONFIG_VALIDATION_FAILED, {
      reason: 'Invalid schema',
      requiredFields: 'metadata.name, pipeline.stages',
    });
  } catch (error) {
    // Minimal format for CI logs
    console.log('CI Format:');
    console.log(
      formatErrorMessage(error, {
        includeCode: true,
        includeSuggestions: false,
        includeDocumentation: false,
        includeStack: false,
      }),
    );

    console.log('\n---\n');

    // Detailed format for debugging
    console.log('Debug Format:');
    console.log(
      formatErrorMessage(error, {
        includeCode: true,
        includeSuggestions: true,
        includeDocumentation: true,
        includeContext: true,
        includeStack: true,
      }),
    );
  }
}

// ============================================================================
// Run Examples
// ============================================================================

async function runAllExamples() {
  console.log('='.repeat(70));
  console.log('Error Formatter Usage Examples');
  console.log('='.repeat(70));

  basicErrorExample();
  richContextExample();
  wrapErrorExample();
  configErrorExample();
  pluginContractExample();
  pipelineErrorExample();
  validationErrorExample();
  hotReloadErrorExample();
  dagCycleExample();
  authErrorExample();
  await asyncErrorHandlingExample();
  serializationExample();
  customFormattingExample();

  console.log('\n' + '='.repeat(70));
  console.log('Examples Complete');
  console.log('='.repeat(70) + '\n');
}

// Run if executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}

module.exports = {
  basicErrorExample,
  richContextExample,
  wrapErrorExample,
  configErrorExample,
  pluginContractExample,
  pipelineErrorExample,
  validationErrorExample,
  hotReloadErrorExample,
  dagCycleExample,
  authErrorExample,
  asyncErrorHandlingExample,
  serializationExample,
  customFormattingExample,
  runAllExamples,
};
