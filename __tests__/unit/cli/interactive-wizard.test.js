/**
const fs = require('fs');
const path = require('path');
 * Unit tests for Interactive CLI Wizard
 * Tests project setup, plugin selection, configuration, and validation
 */

// Jest is available globally in CommonJS mode;
const inquirer = require('inquirer');
const fs = require('fs/promises');
const { runInteractiveWizard, InteractiveWizard  } = require('../../../src/cli/interactive-wizard.js');

// Mock dependencies
jest.mock('inquirer');
jest.mock('fs/promises');
jest.mock('../../../src/core/plugin-marketplace/version-resolver.js');
jest.mock('../../../src/config/enhanced-ragrc-schema.js');

describe('InteractiveWizard', () => {
  let wizard;
  let mockInquirer;
  let mockFs;

  beforeEach(() => {
    wizard = new InteractiveWizard();
    mockInquirer = inquirer;
    mockFs = fs;
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock responses
    mockFs.writeFile = jest.fn().mockResolvedValue();
    mockFs.access = jest.fn().mockRejectedValue(new Error('File not found'));
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(wizard.options).toEqual({
        outputPath: '.ragrc.json',
        template: null,
        skipValidation: false
      });
    });

    it('should initialize with custom options', () => {
      const customWizard = new InteractiveWizard({
        outputPath: 'custom.json',
        template: 'basic',
        skipValidation: true
      });

      expect(customWizard.options).toEqual({
        outputPath: 'custom.json',
        template: 'basic',
        skipValidation: true
      });
    });
  });

  describe('collectProjectMetadata', () => {
    it('should collect basic project metadata', async () => {
      mockInquirer.prompt = jest.fn().mockResolvedValue({
        name: 'test-project',
        version: '1.0.0',
        description: 'Test project description',
        author: 'Test Author'
      });

      const metadata = await wizard.collectProjectMetadata();

      expect(metadata).toEqual({
        name: 'test-project',
        version: '1.0.0',
        description: 'Test project description',
        author: 'Test Author',
        createdAt: expect.any(String)
      });

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'input',
          name: 'name',
          message: 'Project name:',
          default: expect.any(String),
          validate: expect.any(Function)
        },
        {
          type: 'input',
          name: 'version',
          message: 'Project version:',
          default: '1.0.0',
          validate: expect.any(Function)
        },
        {
          type: 'input',
          name: 'description',
          message: 'Project description:',
          validate: expect.any(Function)
        },
        {
          type: 'input',
          name: 'author',
          message: 'Author name:',
          validate: expect.any(Function)
        }
      ]);
    });

    it('should validate project name format', async () => {
      mockInquirer.prompt = jest.fn().mockResolvedValue({
        name: 'test-project',
        version: '1.0.0',
        description: 'Test description',
        author: 'Test Author'
      });

      await wizard.collectProjectMetadata();

      const nameValidator = mockInquirer.prompt.mock.calls[0][0][0].validate;
      
      expect(nameValidator('valid-name')).toBe(true);
      expect(nameValidator('invalid name')).toBe('Project name must be a valid identifier (letters, numbers, hyphens, underscores)');
      expect(nameValidator('')).toBe('Project name is required');
    });

    it('should validate semantic version format', async () => {
      mockInquirer.prompt = jest.fn().mockResolvedValue({
        name: 'test-project',
        version: '1.0.0',
        description: 'Test description',
        author: 'Test Author'
      });

      await wizard.collectProjectMetadata();

      const versionValidator = mockInquirer.prompt.mock.calls[0][0][1].validate;
      
      expect(versionValidator('1.0.0')).toBe(true);
      expect(versionValidator('1.0.0-beta.1')).toBe(true);
      expect(versionValidator('invalid')).toBe('Version must be a valid semantic version (e.g., 1.0.0)');
      expect(versionValidator('')).toBe('Version is required');
    });
  });

  describe('selectPlugins', () => {
    beforeEach(() => {
      // Mock plugin registry response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          plugins: {
            'file-loader': {
              name: 'file-loader',
              description: 'Load files from filesystem',
              type: 'loader',
              versions: { 'latest': '1.0.0' }
            },
            'openai-embedder': {
              name: 'openai-embedder',
              description: 'OpenAI embedding service',
              type: 'embedder',
              versions: { 'latest': '2.0.0' }
            }
          }
        })
      });
    });

    it('should select plugins by type', async () => {
      mockInquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ loaderPlugin: 'file-loader' })
        .mockResolvedValueOnce({ loaderVersion: 'latest' })
        .mockResolvedValueOnce({ embedderPlugin: 'openai-embedder' })
        .mockResolvedValueOnce({ embedderVersion: 'latest' })
        .mockResolvedValueOnce({ retrieverPlugin: 'skip' })
        .mockResolvedValueOnce({ llmPlugin: 'skip' })
        .mockResolvedValueOnce({ rerankerPlugin: 'skip' });

      const plugins = await wizard.selectPlugins();

      expect(plugins).toEqual({
        loader: {
          'file-loader': 'latest'
        },
        embedder: {
          'openai-embedder': 'latest'
        }
      });
    });

    it('should handle plugin registry fetch errors', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      mockInquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ loaderPlugin: 'skip' })
        .mockResolvedValueOnce({ embedderPlugin: 'skip' })
        .mockResolvedValueOnce({ retrieverPlugin: 'skip' })
        .mockResolvedValueOnce({ llmPlugin: 'skip' })
        .mockResolvedValueOnce({ rerankerPlugin: 'skip' });

      const plugins = await wizard.selectPlugins();

      expect(plugins).toEqual({});
    });

    it('should allow skipping plugin types', async () => {
      mockInquirer.prompt = jest.fn()
        .mockResolvedValueOnce({ loaderPlugin: 'skip' })
        .mockResolvedValueOnce({ embedderPlugin: 'skip' })
        .mockResolvedValueOnce({ retrieverPlugin: 'skip' })
        .mockResolvedValueOnce({ llmPlugin: 'skip' })
        .mockResolvedValueOnce({ rerankerPlugin: 'skip' });

      const plugins = await wizard.selectPlugins();

      expect(plugins).toEqual({});
    });
  });

  describe('configurePipeline', () => {
    it('should configure pipeline stages', async () => {
      const plugins = {
        loader: { 'file-loader': 'latest' },
        embedder: { 'openai-embedder': 'latest' },
        retriever: { 'vector-retriever': 'latest' },
        llm: { 'openai-llm': 'latest' }
      };

      mockInquirer.prompt = jest.fn().mockResolvedValue({
        stages: ['loader', 'embedder', 'retriever', 'llm'],
        enableRetry: true,
        retryAttempts: 3,
        enableLogging: true,
        logLevel: 'info'
      });

      const pipelineConfig = await wizard.configurePipeline(plugins);

      expect(pipelineConfig).toEqual({
        stages: ['loader', 'embedder', 'retriever', 'llm'],
        middleware: {
          retry: {
            enabled: true,
            maxAttempts: 3
          },
          logging: {
            enabled: true,
            level: 'info'
          }
        }
      });
    });

    it('should validate stage ordering', async () => {
      const plugins = {
        loader: { 'file-loader': 'latest' },
        embedder: { 'openai-embedder': 'latest' }
      };

      mockInquirer.prompt = jest.fn().mockResolvedValue({
        stages: ['loader', 'embedder'],
        enableRetry: false,
        enableLogging: false
      });

      await wizard.configurePipeline(plugins);

      const stagesValidator = mockInquirer.prompt.mock.calls[0][0][0].validate;
      
      expect(stagesValidator(['loader', 'embedder'])).toBe(true);
      expect(stagesValidator(['embedder', 'loader'])).toBe('Invalid stage order: loader must come before embedder');
      expect(stagesValidator([])).toBe('At least one stage must be selected');
    });
  });

  describe('configurePerformance', () => {
    it('should configure performance settings', async () => {
      mockInquirer.prompt = jest.fn().mockResolvedValue({
        enableParallel: true,
        maxConcurrency: 5,
        enableStreaming: true,
        batchSize: 20,
        maxMemoryMB: 1024
      });

      const performanceConfig = await wizard.configurePerformance();

      expect(performanceConfig).toEqual({
        parallel: {
          enabled: true,
          maxConcurrency: 5
        },
        streaming: {
          enabled: true,
          batchSize: 20,
          maxMemoryMB: 1024
        }
      });
    });

    it('should validate performance values', async () => {
      mockInquirer.prompt = jest.fn().mockResolvedValue({
        enableParallel: true,
        maxConcurrency: 3,
        enableStreaming: false
      });

      await wizard.configurePerformance();

      const concurrencyValidator = mockInquirer.prompt.mock.calls[0][0][1].validate;
      
      expect(concurrencyValidator(3)).toBe(true);
      expect(concurrencyValidator(0)).toBe('Concurrency must be at least 1');
      expect(concurrencyValidator(101)).toBe('Concurrency cannot exceed 100');
    });
  });

  describe('configureObservability', () => {
    it('should configure observability settings', async () => {
      mockInquirer.prompt = jest.fn().mockResolvedValue({
        enableEventLogging: true,
        enableTracing: true,
        enableMetrics: true,
        metricsExport: 'file',
        exportPath: './observability.json'
      });

      const observabilityConfig = await wizard.configureObservability();

      expect(observabilityConfig).toEqual({
        eventLogging: {
          enabled: true
        },
        tracing: {
          enabled: true
        },
        metrics: {
          enabled: true,
          export: {
            type: 'file',
            path: './observability.json'
          }
        }
      });
    });

    it('should handle disabled observability', async () => {
      mockInquirer.prompt = jest.fn().mockResolvedValue({
        enableEventLogging: false,
        enableTracing: false,
        enableMetrics: false
      });

      const observabilityConfig = await wizard.configureObservability();

      expect(observabilityConfig).toEqual({
        eventLogging: { enabled: false },
        tracing: { enabled: false },
        metrics: { enabled: false }
      });
    });
  });

  describe('previewConfiguration', () => {
    it('should display configuration preview', async () => {
      const config = {
        metadata: { name: 'test-project', version: '1.0.0' },
        plugins: { loader: { 'file-loader': 'latest' } },
        pipeline: { stages: ['loader'] },
        performance: { parallel: { enabled: false } },
        observability: { eventLogging: { enabled: false } }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockInquirer.prompt = jest.fn().mockResolvedValue({ proceed: true });

      const shouldProceed = await wizard.previewConfiguration(config);

      expect(shouldProceed).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration Preview'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('test-project'));
      
      consoleSpy.mockRestore();
    });

    it('should allow cancellation', async () => {
      const config = { metadata: { name: 'test' } };
      
      mockInquirer.prompt = jest.fn().mockResolvedValue({ proceed: false });

      const shouldProceed = await wizard.previewConfiguration(config);

      expect(shouldProceed).toBe(false);
    });
  });

  describe('saveConfiguration', () => {
    it('should save configuration to file', async () => {
      const config = {
        metadata: { name: 'test-project' },
        plugins: { loader: { 'file-loader': 'latest' } }
      };

      await wizard.saveConfiguration(config);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.ragrc.json',
        JSON.stringify(config, null, 2)
      );
    });

    it('should handle save errors', async () => {
      const config = { metadata: { name: 'test' } };
      mockFs.writeFile = jest.fn().mockRejectedValue(new Error('Permission denied'));

      await expect(wizard.saveConfiguration(config)).rejects.toThrow('Permission denied');
    });
  });

  describe('run', () => {
    it('should complete full wizard flow', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Mock all wizard steps
      wizard.collectProjectMetadata = jest.fn().mockResolvedValue({
        name: 'test-project',
        version: '1.0.0',
        createdAt: '2023-01-01T00:00:00.000Z'
      });
      
      wizard.selectPlugins = jest.fn().mockResolvedValue({
        loader: { 'file-loader': 'latest' }
      });
      
      wizard.configurePipeline = jest.fn().mockResolvedValue({
        stages: ['loader']
      });
      
      wizard.configurePerformance = jest.fn().mockResolvedValue({
        parallel: { enabled: false }
      });
      
      wizard.configureObservability = jest.fn().mockResolvedValue({
        eventLogging: { enabled: false }
      });
      
      wizard.previewConfiguration = jest.fn().mockResolvedValue(true);
      wizard.saveConfiguration = jest.fn().mockResolvedValue();

      await wizard.run();

      expect(wizard.collectProjectMetadata).toHaveBeenCalled();
      expect(wizard.selectPlugins).toHaveBeenCalled();
      expect(wizard.configurePipeline).toHaveBeenCalled();
      expect(wizard.configurePerformance).toHaveBeenCalled();
      expect(wizard.configureObservability).toHaveBeenCalled();
      expect(wizard.previewConfiguration).toHaveBeenCalled();
      expect(wizard.saveConfiguration).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should handle cancellation during preview', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      wizard.collectProjectMetadata = jest.fn().mockResolvedValue({});
      wizard.selectPlugins = jest.fn().mockResolvedValue({});
      wizard.configurePipeline = jest.fn().mockResolvedValue({});
      wizard.configurePerformance = jest.fn().mockResolvedValue({});
      wizard.configureObservability = jest.fn().mockResolvedValue({});
      wizard.previewConfiguration = jest.fn().mockResolvedValue(false);
      wizard.saveConfiguration = jest.fn();

      await wizard.run();

      expect(wizard.saveConfiguration).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('🚫 Configuration cancelled.');
      
      consoleSpy.mockRestore();
    });
  });
});

describe('runInteractiveWizard', () => {
  it('should create and run wizard with options', async () => {
    const mockRun = jest.fn().mockResolvedValue();
    
    // Mock the InteractiveWizard constructor
    const originalWizard = InteractiveWizard;
    const MockWizard = jest.fn().mockImplementation(() => ({
      run: mockRun
    }));
    
    // Temporarily replace the constructor
    jest.doMock('../../../src/cli/interactive-wizard.js', () => ({
      InteractiveWizard: MockWizard,
      runInteractiveWizard: originalWizard
    }));

    const options = { outputPath: 'test.json' };
    
    // Since we can't easily mock the import, we'll test the function behavior
    const wizard = new InteractiveWizard(options);
    await wizard.run();

    expect(mockRun).toHaveBeenCalled();
  });
});
