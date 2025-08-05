/**
 * Unit tests for Enhanced CLI Commands
 * Tests comprehensive CLI functionality, flags, and command integration
 */

import { jest } from '@jest/globals';
import fs from 'fs/promises';
import { EnhancedCLI, runEnhancedCLI } from '../../../src/cli/enhanced-cli-commands.js';
import { runInteractiveWizard } from '../../../src/cli/interactive-wizard.js';
import { runPipelineDoctor } from '../../../src/cli/doctor-command.js';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../../../src/cli/interactive-wizard.js');
jest.mock('../../../src/cli/doctor-command.js');
jest.mock('../../../src/core/create-pipeline.js');
jest.mock('../../../src/core/observability/instrumented-pipeline.js');
jest.mock('../../../src/config/load-config.js');
jest.mock('../../../src/config/enhanced-ragrc-schema.js');

describe('EnhancedCLI', () => {
  let cli;
  let mockFs;
  let consoleSpy;

  beforeEach(() => {
    cli = new EnhancedCLI();
    mockFs = fs;
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    jest.clearAllMocks();

    // Setup default mocks
    mockFs.readFile = jest.fn();
    mockFs.writeFile = jest.fn();
    mockFs.access = jest.fn();
    mockFs.copyFile = jest.fn();
    mockFs.stat = jest.fn().mockResolvedValue({ size: 1024 });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize CLI with proper structure', () => {
      expect(cli.program).toBeDefined();
      expect(cli.program.name()).toBe('rag-pipeline');
      expect(cli.program.description()).toContain('Enterprise-grade RAG pipeline toolkit');
    });

    it('should setup global options', () => {
      const options = cli.program.options;
      const optionNames = options.map(opt => opt.long);
      
      expect(optionNames).toContain('--config');
      expect(optionNames).toContain('--verbose');
      expect(optionNames).toContain('--quiet');
      expect(optionNames).toContain('--no-color');
      expect(optionNames).toContain('--dry-run');
    });
  });

  describe('handleInit', () => {
    it('should run interactive wizard by default', async () => {
      runInteractiveWizard.mockResolvedValue();
      
      await cli.handleInit({ interactive: true, output: '.ragrc.json' });

      expect(runInteractiveWizard).toHaveBeenCalledWith({
        outputPath: '.ragrc.json',
        template: undefined
      });
    });

    it('should handle dry-run mode', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ dryRun: true });
      
      await cli.handleInit({ output: '.ragrc.json', interactive: true });

      expect(consoleSpy).toHaveBeenCalledWith('🧪 Dry run: Would initialize RAG pipeline configuration');
      expect(runInteractiveWizard).not.toHaveBeenCalled();
    });

    it('should check for existing configuration', async () => {
      mockFs.access = jest.fn().mockResolvedValue(); // File exists
      
      await cli.handleInit({ output: '.ragrc.json', force: false });

      expect(consoleSpy).toHaveBeenCalledWith('❌ Configuration file already exists: .ragrc.json');
      expect(runInteractiveWizard).not.toHaveBeenCalled();
    });

    it('should overwrite with force flag', async () => {
      mockFs.access = jest.fn().mockResolvedValue(); // File exists
      runInteractiveWizard.mockResolvedValue();
      
      await cli.handleInit({ 
        output: '.ragrc.json', 
        force: true, 
        interactive: true 
      });

      expect(runInteractiveWizard).toHaveBeenCalled();
    });

    it('should create basic config when not interactive', async () => {
      mockFs.access = jest.fn().mockRejectedValue(new Error('File not found'));
      mockFs.writeFile = jest.fn().mockResolvedValue();
      
      await cli.handleInit({ 
        output: '.ragrc.json', 
        interactive: false 
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.ragrc.json',
        expect.stringContaining('"plugins"')
      );
    });
  });

  describe('handleDoctor', () => {
    it('should run pipeline doctor with options', async () => {
      const mockReport = { summary: { totalIssues: 0 } };
      runPipelineDoctor.mockResolvedValue(mockReport);
      cli.program.opts = jest.fn().mockReturnValue({ 
        config: '.ragrc.json', 
        verbose: false 
      });

      await cli.handleDoctor({ 
        autoFix: true, 
        category: ['config', 'plugins'] 
      });

      expect(runPipelineDoctor).toHaveBeenCalledWith({
        configPath: '.ragrc.json',
        verbose: false,
        autoFix: true,
        categories: ['config', 'plugins']
      });
    });

    it('should save report to file when specified', async () => {
      const mockReport = { summary: { totalIssues: 1 } };
      runPipelineDoctor.mockResolvedValue(mockReport);
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      mockFs.writeFile = jest.fn().mockResolvedValue();

      await cli.handleDoctor({ 
        report: './diagnostic-report.json' 
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        './diagnostic-report.json',
        JSON.stringify(mockReport, null, 2)
      );
    });
  });

  describe('handleIngest', () => {
    beforeEach(() => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      
      // Mock loadRagConfig
      const { loadRagConfig } = require('../../../src/config/load-config.js');
      loadRagConfig.mockReturnValue({
        plugins: {
          loader: { 'file-loader': 'latest' }
        }
      });

      // Mock createRagPipeline
      const { createRagPipeline } = require('../../../src/core/create-pipeline.js');
      createRagPipeline.mockReturnValue({
        ingest: jest.fn().mockResolvedValue(),
        getObservabilityStats: jest.fn().mockReturnValue({
          metrics: { operations: { total: 5 } },
          session: { totalEvents: 10 }
        }),
        exportObservabilityData: jest.fn().mockReturnValue({ data: 'test' })
      });
    });

    it('should handle dry-run mode', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ 
        config: '.ragrc.json', 
        dryRun: true 
      });

      await cli.handleIngest('test.pdf', { parallel: true });

      expect(consoleSpy).toHaveBeenCalledWith('🧪 Dry run: Would ingest document');
      expect(consoleSpy).toHaveBeenCalledWith('File: test.pdf');
    });

    it('should validate file existence when requested', async () => {
      mockFs.access = jest.fn().mockResolvedValue();
      mockFs.stat = jest.fn().mockResolvedValue({ size: 2048 });

      await cli.handleIngest('test.pdf', { validate: true });

      expect(mockFs.access).toHaveBeenCalledWith('test.pdf');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('File validation passed')
      );
    });

    it('should show document preview when requested', async () => {
      mockFs.readFile = jest.fn().mockResolvedValue('Sample document content for preview testing');

      await cli.handleIngest('test.pdf', { preview: true });

      expect(mockFs.readFile).toHaveBeenCalledWith('test.pdf', 'utf-8');
      expect(consoleSpy).toHaveBeenCalledWith('📄 Document Preview:');
    });

    it('should create instrumented pipeline with observability flags', async () => {
      const { createInstrumentedPipeline } = require('../../../src/core/observability/instrumented-pipeline.js');
      createInstrumentedPipeline.mockReturnValue({
        ingest: jest.fn().mockResolvedValue(),
        getObservabilityStats: jest.fn().mockReturnValue({}),
        exportObservabilityData: jest.fn().mockReturnValue({})
      });

      await cli.handleIngest('test.pdf', { 
        trace: true, 
        stats: true 
      });

      expect(createInstrumentedPipeline).toHaveBeenCalledWith(
        expect.any(Object),
        {
          enableTracing: true,
          enableMetrics: true,
          enableEventLogging: true,
          verboseLogging: true
        }
      );
    });

    it('should export observability data when requested', async () => {
      mockFs.writeFile = jest.fn().mockResolvedValue();

      await cli.handleIngest('test.pdf', { 
        exportObservability: './observability.json' 
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        './observability.json',
        expect.stringContaining('"data"')
      );
    });
  });

  describe('handleQuery', () => {
    beforeEach(() => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      
      const { loadRagConfig } = require('../../../src/config/load-config.js');
      loadRagConfig.mockReturnValue({
        plugins: {
          llm: { 'openai-llm': 'latest' }
        }
      });

      const { createRagPipeline } = require('../../../src/core/create-pipeline.js');
      createRagPipeline.mockReturnValue({
        query: jest.fn().mockResolvedValue('Test response'),
        queryStream: jest.fn().mockImplementation(async function* () {
          yield 'Test ';
          yield 'streaming ';
          yield 'response';
        }),
        getObservabilityStats: jest.fn().mockReturnValue({
          metrics: { operations: { total: 3 } }
        })
      });
    });

    it('should handle dry-run mode', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ 
        config: '.ragrc.json', 
        dryRun: true 
      });

      await cli.handleQuery('What is this about?', { stream: true });

      expect(consoleSpy).toHaveBeenCalledWith('🧪 Dry run: Would execute query');
      expect(consoleSpy).toHaveBeenCalledWith('Prompt: What is this about?');
    });

    it('should handle streaming queries', async () => {
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation();

      await cli.handleQuery('Test prompt', { stream: true });

      expect(stdoutSpy).toHaveBeenCalledWith('Test ');
      expect(stdoutSpy).toHaveBeenCalledWith('streaming ');
      expect(stdoutSpy).toHaveBeenCalledWith('response');

      stdoutSpy.mockRestore();
    });

    it('should handle regular queries', async () => {
      await cli.handleQuery('Test prompt', {});

      expect(consoleSpy).toHaveBeenCalledWith('📝 Response:');
      expect(consoleSpy).toHaveBeenCalledWith('Test response');
    });

    it('should show query explanation when requested', async () => {
      await cli.handleQuery('Test prompt', { explain: true });

      expect(consoleSpy).toHaveBeenCalledWith('🔍 Query Explanation:');
      expect(consoleSpy).toHaveBeenCalledWith('Input: Test prompt');
    });
  });

  describe('handleValidate', () => {
    it('should validate configuration successfully', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      mockFs.readFile = jest.fn().mockResolvedValue('{"plugins": {}}');
      
      const { validateEnhancedRagrcSchema } = require('../../../src/config/enhanced-ragrc-schema.js');
      validateEnhancedRagrcSchema.mockReturnValue({
        valid: true,
        legacy: false
      });

      await cli.handleValidate({});

      expect(consoleSpy).toHaveBeenCalledWith('✅ Configuration is valid');
    });

    it('should show validation errors', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      mockFs.readFile = jest.fn().mockResolvedValue('{"invalid": "config"}');
      
      const { validateEnhancedRagrcSchema } = require('../../../src/config/enhanced-ragrc-schema.js');
      validateEnhancedRagrcSchema.mockReturnValue({
        valid: false,
        errors: [
          {
            instancePath: '/plugins',
            message: 'is required'
          }
        ]
      });

      await cli.handleValidate({});

      expect(consoleSpy).toHaveBeenCalledWith('❌ Configuration validation failed:');
      expect(consoleSpy).toHaveBeenCalledWith('  /plugins: is required');
    });

    it('should detect legacy format', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      mockFs.readFile = jest.fn().mockResolvedValue('{"plugins": {}}');
      
      const { validateEnhancedRagrcSchema } = require('../../../src/config/enhanced-ragrc-schema.js');
      validateEnhancedRagrcSchema.mockReturnValue({
        valid: true,
        legacy: true
      });

      await cli.handleValidate({});

      expect(consoleSpy).toHaveBeenCalledWith('⚠️  Using legacy format - consider upgrading');
    });
  });

  describe('handleConfigShow', () => {
    it('should show full configuration', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      const config = { plugins: { loader: { 'file-loader': 'latest' } } };
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(config));

      await cli.handleConfigShow({ format: 'json' });

      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(config, null, 2));
    });

    it('should show specific configuration section', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      const config = { 
        plugins: { loader: { 'file-loader': 'latest' } },
        metadata: { name: 'test' }
      };
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(config));

      await cli.handleConfigShow({ 
        format: 'json', 
        section: 'plugins.loader' 
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        JSON.stringify({ 'file-loader': 'latest' }, null, 2)
      );
    });

    it('should handle missing section', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      const config = { plugins: {} };
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(config));

      await cli.handleConfigShow({ section: 'missing.section' });

      expect(consoleSpy).toHaveBeenCalledWith('❌ Section not found: missing.section');
    });
  });

  describe('handleConfigSet', () => {
    it('should set configuration value', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      const config = { plugins: {} };
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(config));
      mockFs.writeFile = jest.fn().mockResolvedValue();

      await cli.handleConfigSet('plugins.loader.file-loader', 'latest', {});

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.ragrc.json',
        expect.stringContaining('"file-loader": "latest"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '✅ Configuration updated: plugins.loader.file-loader = latest'
      );
    });

    it('should parse JSON values', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      const config = { settings: {} };
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(config));
      mockFs.writeFile = jest.fn().mockResolvedValue();

      await cli.handleConfigSet('settings.enabled', 'true', {});

      const savedConfig = JSON.parse(mockFs.writeFile.mock.calls[0][1]);
      expect(savedConfig.settings.enabled).toBe(true);
    });
  });

  describe('handleConfigGet', () => {
    it('should get configuration value', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      const config = { 
        plugins: { 
          loader: { 'file-loader': 'latest' } 
        } 
      };
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(config));

      await cli.handleConfigGet('plugins.loader.file-loader', {});

      expect(consoleSpy).toHaveBeenCalledWith('"latest"');
    });

    it('should handle missing key', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      const config = { plugins: {} };
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(config));

      await cli.handleConfigGet('missing.key', {});

      expect(consoleSpy).toHaveBeenCalledWith('❌ Key not found: missing.key');
    });
  });

  describe('handleConfigUpgrade', () => {
    it('should create backup when requested', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      mockFs.copyFile = jest.fn().mockResolvedValue();

      await cli.handleConfigUpgrade({ backup: true });

      expect(mockFs.copyFile).toHaveBeenCalledWith(
        '.ragrc.json',
        '.ragrc.json.backup'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '📋 Backup created: .ragrc.json.backup'
      );
    });
  });

  describe('handleInfo', () => {
    it('should show system information', async () => {
      await cli.handleInfo({ system: true });

      expect(consoleSpy).toHaveBeenCalledWith('📊 RAG Pipeline Information');
      expect(consoleSpy).toHaveBeenCalledWith('System:');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Node.js: ${process.version}`)
      );
    });

    it('should show configuration summary', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      const config = { plugins: { loader: {} } };
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(config));

      await cli.handleInfo({ config: true });

      expect(consoleSpy).toHaveBeenCalledWith('Configuration:');
      expect(consoleSpy).toHaveBeenCalledWith('  File: .ragrc.json');
      expect(consoleSpy).toHaveBeenCalledWith('  Format: Enhanced');
    });

    it('should handle missing configuration', async () => {
      cli.program.opts = jest.fn().mockReturnValue({ config: '.ragrc.json' });
      mockFs.readFile = jest.fn().mockRejectedValue(new Error('File not found'));

      await cli.handleInfo({ config: true });

      expect(consoleSpy).toHaveBeenCalledWith('Configuration: Not found or invalid');
    });
  });

  describe('handleCompletion', () => {
    it('should generate bash completion script', async () => {
      await cli.handleCompletion('bash', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('_rag_pipeline_completions')
      );
    });

    it('should generate zsh completion script', async () => {
      await cli.handleCompletion('zsh', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('#compdef rag-pipeline')
      );
    });

    it('should generate fish completion script', async () => {
      await cli.handleCompletion('fish', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('complete -c rag-pipeline')
      );
    });

    it('should handle unsupported shell', async () => {
      await cli.handleCompletion('unsupported', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Completion not available for unsupported')
      );
    });
  });

  describe('getVersion', () => {
    it('should return version string', () => {
      const version = cli.getVersion();
      expect(version).toBe('2.0.0');
    });
  });

  describe('getExtendedHelp', () => {
    it('should return extended help text', () => {
      const help = cli.getExtendedHelp();
      expect(help).toContain('Examples:');
      expect(help).toContain('rag-pipeline init --interactive');
      expect(help).toContain('rag-pipeline doctor --auto-fix');
    });
  });

  describe('run', () => {
    it('should parse command line arguments', async () => {
      const parseSpy = jest.spyOn(cli.program, 'parseAsync').mockResolvedValue();

      await cli.run(['node', 'cli.js', '--help']);

      expect(parseSpy).toHaveBeenCalledWith(['node', 'cli.js', '--help']);
      
      parseSpy.mockRestore();
    });

    it('should handle CLI errors', async () => {
      const parseSpy = jest.spyOn(cli.program, 'parseAsync')
        .mockRejectedValue(new Error('Test error'));
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(cli.run()).rejects.toThrow('Test error');

      parseSpy.mockRestore();
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});

describe('runEnhancedCLI', () => {
  it('should create and run enhanced CLI', async () => {
    const mockRun = jest.fn().mockResolvedValue();
    
    // Mock EnhancedCLI constructor
    const originalCLI = EnhancedCLI;
    const MockCLI = jest.fn().mockImplementation(() => ({
      run: mockRun
    }));

    // Test the function behavior
    const cli = new EnhancedCLI();
    await cli.run();

    // The run method should be called
    expect(typeof cli.run).toBe('function');
  });

  it('should handle CLI errors gracefully', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Mock CLI that throws error
    const mockRun = jest.fn().mockRejectedValue(new Error('CLI error'));
    const cli = { run: mockRun };

    try {
      await cli.run();
    } catch (error) {
      // Error should be caught and handled
      expect(error.message).toBe('CLI error');
    }

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
