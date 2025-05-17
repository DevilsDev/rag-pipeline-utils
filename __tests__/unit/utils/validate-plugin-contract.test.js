import { validatePluginContract } from '../../../src/utils/validate-plugin-contract.js';

const dummyPath = 'mock-plugin.js';

describe('validatePluginContract', () => {
  test('passes when plugin implements required methods', () => {
    const plugin = { load() {} };
    expect(() => validatePluginContract('loader', plugin, dummyPath)).not.toThrow();
  });

  test('throws error when required methods are missing', () => {
    const plugin = {};
    expect(() => validatePluginContract('loader', plugin, dummyPath)).toThrow(
      `[validatePluginContract] Plugin '${dummyPath}' is missing required methods for 'loader': load`
    );
  });

  test('throws error for unknown plugin type', () => {
    const plugin = {};
    expect(() => validatePluginContract('unknown', plugin, dummyPath)).toThrow(
      `[validatePluginContract] Unknown plugin type: unknown`
    );
  });
});
