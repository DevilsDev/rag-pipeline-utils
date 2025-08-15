/**
 * Version: 0.1.0
 * Path: /__tests__/unit/core/plugin-registry.test.js
 * Description: Unit tests for the PluginRegistry class
 * Author: Ali Kahwaji
 */

const { PluginRegistry  } = require('../../../src/core/plugin-registry.js');

describe('PluginRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  test('registers and retrieves a plugin successfully', () => {
    const mockPlugin = { name: 'test-loader' };
    registry.register('loader', 'test', mockPlugin);
    const result = registry.get('loader', 'test');
    expect(result).toBe(mockPlugin);
  });

  test('overwrites existing plugin under the same name', () => {
    const firstPlugin = { name: 'first' };
    const secondPlugin = { name: 'second' };
    registry.register('embedder', 'dup', firstPlugin);
    registry.register('embedder', 'dup', secondPlugin);
    const result = registry.get('embedder', 'dup');
    expect(result).toBe(secondPlugin);
  });

  test('throws error for unknown plugin type on registration', () => {
    expect(() => registry.register('unknown-type', 'x', {})).toThrow(/Unknown plugin type/);
  });

  test('throws error when retrieving a nonexistent plugin', () => {
    expect(() => registry.get('retriever', 'missing')).toThrow(/Plugin not found/);
  });

  test('lists all registered plugin names for a type', () => {
    registry.register('llm', 'gpt-4', { 
            generate: jest.fn().mockResolvedValue('response') 
          });
    registry.register('llm', 'gpt-3.5', {});
    const list = registry.list('llm');
    expect(list).toContain('gpt-4');
    expect(list).toContain('gpt-3.5');
    expect(list.length).toBe(2);
  });

  test('throws error when listing plugins for invalid type', () => {
    expect(() => registry.list('invalid')).toThrow(/Unknown plugin type/);
  });
});


