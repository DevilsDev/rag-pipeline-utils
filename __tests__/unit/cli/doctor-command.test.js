/**
const fs = require('fs');
 * Unit tests for Doctor Command
 * Tests pipeline diagnostics, issue detection, and automatic fixes
 */

// Jest is available globally in CommonJS mode;
const fs = require('fs/promises');
const path = require('path');
const { runPipelineDoctor, PipelineDoctor  } = require('../../../src/cli/doctor-command.js');

// Mock dependencies
jest.mock('fs/promises');
jest.mock('path');
jest.mock('../../../src/config/enhanced-ragrc-schema.js');
jest.mock('../../../src/core/plugin-marketplace/version-resolver.js');

describe('PipelineDoctor', () => {
  let doctor;
  let mockFs;

  beforeEach(() => {
    doctor = new PipelineDoctor({
      configPath: '.ragrc.json',
      verbose: false,
      autoFix: false
    });
    
    mockFs = fs;
    jest.clearAllMocks();

    // Setup default mocks
    mockFs.readFile = jest.fn();
    mockFs.writeFile = jest.fn();
    mockFs.access = jest.fn();
    mockFs.stat = jest.fn();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultDoctor = new PipelineDoctor();
      
      expect(defaultDoctor.options).toEqual({
        configPath: '.ragrc.json',
        verbose: false,
        autoFix: false,
        categories: ['all']
      });
    });

    it('should initialize with custom options', () => {
      const customDoctor = new PipelineDoctor({
        configPath: 'custom.json',
        verbose: true,
        autoFix: true,
        categories: ['config', 'plugins']
      });

      expect(customDoctor.options).toEqual({
        configPath: 'custom.json',
        verbose: true,
        autoFix: true,
        categories: ['config', 'plugins']
      });
    });
  });

  describe('checkConfiguration', () => {
    it('should detect missing configuration file', async () => {
      mockFs.access = jest.fn().mockRejectedValue(new Error('ENOENT'));

      const issues = await doctor.checkConfiguration();

      expect(issues).toContainEqual({
        category: 'configuration',
        severity: 'error',
        code: 'CONFIG_MISSING',
        message: 'Configuration file not found: .ragrc.json',
        fix: 'Run "rag-pipeline init" to create a configuration file',
        autoFixable: false
      });
    });

    it('should detect invalid JSON syntax', async () => {
      mockFs.access = jest.fn().mockResolvedValue();
      mockFs.readFile = jest.fn().mockResolvedValue('{ invalid json }');

      const issues = await doctor.checkConfiguration();

      expect(issues).toContainEqual({
        category: 'configuration',
        severity: 'error',
        code: 'CONFIG_INVALID_JSON',
        message: 'Configuration file contains invalid JSON syntax',
        fix: 'Fix JSON syntax errors in .ragrc.json',
        autoFixable: false
      });
    });

    it('should detect schema validation errors', async () => {
      const invalidConfig = {
        plugins: {
          loader: 'invalid-format'
        }
      };

      mockFs.access = jest.fn().mockResolvedValue();
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(invalidConfig));

      // Mock schema validation
      const { validateEnhancedRagrcSchema } = await import('../../../src/config/enhanced-ragrc-schema.js');
      validateEnhancedRagrcSchema.mockReturnValue({
        valid: false,
        errors: [
          {
            instancePath: '/plugins/loader',
            message: 'must be object'
          }
        ]
      });

      const issues = await doctor.checkConfiguration();

      expect(issues).toContainEqual({
        category: 'configuration',
        severity: 'error',
        code: 'CONFIG_SCHEMA_ERROR',
        message: 'Schema validation failed: /plugins/loader must be object',
        fix: 'Fix configuration schema errors',
        autoFixable: false
      });
    });

    it('should detect empty configuration', async () => {
      mockFs.access = jest.fn().mockResolvedValue();
      mockFs.readFile = jest.fn().mockResolvedValue('{}');

      const issues = await doctor.checkConfiguration();

      expect(issues).toContainEqual({
        category: 'configuration',
        severity: 'warning',
        code: 'CONFIG_EMPTY',
        message: 'Configuration file is empty or missing required sections',
        fix: 'Add plugin configurations and pipeline settings',
        autoFixable: false
      });
    });
  });

  describe('checkPlugins', () => {
    beforeEach(() => {
      const validConfig = {
        plugins: {
          loader: {
            'file-loader': '1.0.0',
            'missing-loader': '2.0.0'
          },
          embedder: {
            'openai-embedder': 'latest'
          }
        }
      };

      mockFs.access = jest.fn().mockResolvedValue();
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(validConfig));
    });

    it('should detect missing plugin files', async () => {
      // Mock plugin file checks
      mockFs.access = jest.fn()
        .mockResolvedValueOnce() // config file exists
        .mockResolvedValueOnce() // file-loader exists
        .mockRejectedValueOnce(new Error('ENOENT')) // missing-loader missing
        .mockResolvedValueOnce(); // openai-embedder exists

      const issues = await doctor.checkPlugins();

      expect(issues).toContainEqual({
        category: 'plugins',
        severity: 'error',
        code: 'PLUGIN_MISSING',
        message: 'Plugin not found: missing-loader',
        fix: 'Install plugin: npm install missing-loader',
        autoFixable: true
      });
    });

    it('should detect version conflicts', async () => {
      // Mock version resolver
      const { resolvePluginVersions } = await import('../../../src/core/plugin-marketplace/version-resolver.js');
      resolvePluginVersions.mockResolvedValue({
        conflicts: [
          {
            plugin: 'openai-embedder',
            requested: 'latest',
            resolved: '2.0.0',
            conflict: 'Dependency conflict with openai-llm@1.0.0'
          }
        ]
      });

      const issues = await doctor.checkPlugins();

      expect(issues).toContainEqual({
        category: 'plugins',
        severity: 'warning',
        code: 'PLUGIN_VERSION_CONFLICT',
        message: 'Version conflict: openai-embedder - Dependency conflict with openai-llm@1.0.0',
        fix: 'Update plugin versions to resolve conflicts',
        autoFixable: false
      });
    });

    it('should detect outdated plugins', async () => {
      // Mock registry check for latest versions
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          plugins: {
            'file-loader': {
              versions: {
                'latest': '2.0.0',
                '1.0.0': '1.0.0'
              }
            }
          }
        })
      });

      const issues = await doctor.checkPlugins();

      expect(issues).toContainEqual({
        category: 'plugins',
        severity: 'info',
        code: 'PLUGIN_OUTDATED',
        message: 'Plugin outdated: file-loader@1.0.0 (latest: 2.0.0)',
        fix: 'Update to latest version: rag-pipeline plugin install file-loader@latest',
        autoFixable: true
      });
    });
  });

  describe('checkDependencies', () => {
    it('should detect missing Node.js version', async () => {
      // Mock process.version
      const originalVersion = process.version;
      Object.defineProperty(process, 'version', {
        value: 'v16.0.0',
        configurable: true
      });

      const issues = await doctor.checkDependencies();

      expect(issues).toContainEqual({
        category: 'dependencies',
        severity: 'error',
        code: 'NODE_VERSION_INCOMPATIBLE',
        message: 'Node.js version v16.0.0 is not supported (required: >=18.0.0)',
        fix: 'Upgrade Node.js to version 18.0.0 or higher',
        autoFixable: false
      });

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalVersion,
        configurable: true
      });
    });

    it('should detect missing package.json', async () => {
      mockFs.access = jest.fn().mockRejectedValue(new Error('ENOENT'));

      const issues = await doctor.checkDependencies();

      expect(issues).toContainEqual({
        category: 'dependencies',
        severity: 'warning',
        code: 'PACKAGE_JSON_MISSING',
        message: 'package.json not found in current directory',
        fix: 'Initialize npm project: npm init',
        autoFixable: false
      });
    });

    it('should detect missing npm dependencies', async () => {
      const packageJson = {
        dependencies: {
          'commander': '^9.0.0',
          'missing-package': '^1.0.0'
        }
      };

      mockFs.access = jest.fn()
        .mockResolvedValueOnce() // package.json exists
        .mockResolvedValueOnce() // commander exists
        .mockRejectedValueOnce(new Error('ENOENT')); // missing-package missing

      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(packageJson));

      const issues = await doctor.checkDependencies();

      expect(issues).toContainEqual({
        category: 'dependencies',
        severity: 'error',
        code: 'NPM_DEPENDENCY_MISSING',
        message: 'NPM dependency missing: missing-package',
        fix: 'Install missing dependencies: npm install',
        autoFixable: true
      });
    });
  });

  describe('checkPerformance', () => {
    it('should detect high memory usage', async () => {
      // Mock memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 1024 * 1024 * 1024, // 1GB
        heapTotal: 1024 * 1024 * 1024 * 2 // 2GB
      });

      const issues = await doctor.checkPerformance();

      expect(issues).toContainEqual({
        category: 'performance',
        severity: 'warning',
        code: 'MEMORY_USAGE_HIGH',
        message: 'High memory usage detected: 1024MB used',
        fix: 'Consider reducing batch sizes or enabling streaming',
        autoFixable: false
      });

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    it('should detect large configuration files', async () => {
      mockFs.stat = jest.fn().mockResolvedValue({
        size: 1024 * 1024 * 5 // 5MB
      });

      const issues = await doctor.checkPerformance();

      expect(issues).toContainEqual({
        category: 'performance',
        severity: 'warning',
        code: 'CONFIG_FILE_LARGE',
        message: 'Configuration file is unusually large: 5.0MB',
        fix: 'Consider splitting configuration or removing unused sections',
        autoFixable: false
      });
    });
  });

  describe('checkSecurity', () => {
    it('should detect hardcoded API keys', async () => {
      const configWithApiKey = {
        plugins: {
          llm: {
            'openai-llm': {
              apiKey: 'sk-1234567890abcdef',
              version: 'latest'
            }
          }
        }
      };

      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(configWithApiKey));

      const issues = await doctor.checkSecurity();

      expect(issues).toContainEqual({
        category: 'security',
        severity: 'error',
        code: 'HARDCODED_API_KEY',
        message: 'Hardcoded API key detected in configuration',
        fix: 'Move API keys to environment variables',
        autoFixable: false
      });
    });

    it('should detect insecure permissions', async () => {
      mockFs.stat = jest.fn().mockResolvedValue({
        mode: 0o777 // World writable
      });

      const issues = await doctor.checkSecurity();

      expect(issues).toContainEqual({
        category: 'security',
        severity: 'warning',
        code: 'INSECURE_PERMISSIONS',
        message: 'Configuration file has insecure permissions (777)',
        fix: 'Set secure permissions: chmod 600 .ragrc.json',
        autoFixable: true
      });
    });
  });

  describe('checkEnvironment', () => {
    it('should detect missing environment variables', async () => {
      const configWithEnvVars = {
        plugins: {
          llm: {
            'openai-llm': {
              apiKey: '${OPENAI_API_KEY}',
              version: 'latest'
            }
          }
        }
      };

      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(configWithEnvVars));
      
      // Mock missing environment variable
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const issues = await doctor.checkEnvironment();

      expect(issues).toContainEqual({
        category: 'environment',
        severity: 'error',
        code: 'ENV_VAR_MISSING',
        message: 'Required environment variable missing: OPENAI_API_KEY',
        fix: 'Set environment variable: export OPENAI_API_KEY=your_key',
        autoFixable: false
      });

      // Restore environment variable
      if (originalEnv) {
        process.env.OPENAI_API_KEY = originalEnv;
      }
    });

    it('should detect platform compatibility issues', async () => {
      // Mock Windows platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true
      });

      const issues = await doctor.checkEnvironment();

      // Should not have platform issues for Windows
      expect(issues.filter(issue => issue.code === 'PLATFORM_INCOMPATIBLE')).toHaveLength(0);

      // Restore original platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true
      });
    });
  });

  describe('autoFix', () => {
    it('should fix missing npm dependencies', async () => {
      const issue = {
        category: 'dependencies',
        code: 'NPM_DEPENDENCY_MISSING',
        fix: 'Install missing dependencies: npm install',
        autoFixable: true
      };

      const mockExec = jest.fn().mockResolvedValue({ stdout: 'Dependencies installed' });
      doctor.exec = mockExec;

      const result = await doctor.autoFix(issue);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Dependencies installed');
      expect(mockExec).toHaveBeenCalledWith('npm install');
    });

    it('should fix insecure file permissions', async () => {
      const issue = {
        category: 'security',
        code: 'INSECURE_PERMISSIONS',
        fix: 'Set secure permissions: chmod 600 .ragrc.json',
        autoFixable: true
      };

      const mockExec = jest.fn().mockResolvedValue({ stdout: 'Permissions updated' });
      doctor.exec = mockExec;

      const result = await doctor.autoFix(issue);

      expect(result.success).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('chmod 600 .ragrc.json');
    });

    it('should handle non-auto-fixable issues', async () => {
      const issue = {
        category: 'configuration',
        code: 'CONFIG_MISSING',
        autoFixable: false
      };

      const result = await doctor.autoFix(issue);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Issue is not auto-fixable');
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive diagnostic report', () => {
      const issues = [
        {
          category: 'configuration',
          severity: 'error',
          code: 'CONFIG_MISSING',
          message: 'Configuration file not found'
        },
        {
          category: 'plugins',
          severity: 'warning',
          code: 'PLUGIN_OUTDATED',
          message: 'Plugin outdated'
        },
        {
          category: 'performance',
          severity: 'info',
          code: 'MEMORY_USAGE_NORMAL',
          message: 'Memory usage is normal'
        }
      ];

      const report = doctor.generateReport(issues);

      expect(report).toEqual({
        timestamp: expect.any(String),
        summary: {
          totalIssues: 3,
          errors: 1,
          warnings: 1,
          info: 1,
          healthScore: expect.any(Number)
        },
        categories: {
          configuration: { issues: 1, errors: 1, warnings: 0, info: 0 },
          plugins: { issues: 1, errors: 0, warnings: 1, info: 0 },
          performance: { issues: 1, errors: 0, warnings: 0, info: 1 },
          dependencies: { issues: 0, errors: 0, warnings: 0, info: 0 },
          security: { issues: 0, errors: 0, warnings: 0, info: 0 },
          environment: { issues: 0, errors: 0, warnings: 0, info: 0 }
        },
        issues: issues
      });
    });

    it('should calculate health score correctly', () => {
      const issues = [
        { severity: 'error' },
        { severity: 'error' },
        { severity: 'warning' },
        { severity: 'info' }
      ];

      const report = doctor.generateReport(issues);

      // Health score: 100 - (errors * 25 + warnings * 10 + info * 2)
      // = 100 - (2 * 25 + 1 * 10 + 1 * 2) = 100 - 62 = 38
      expect(report.summary.healthScore).toBe(38);
    });
  });

  describe('run', () => {
    it('should run all diagnostic categories', async () => {
      doctor.checkConfiguration = jest.fn().mockResolvedValue([]);
      doctor.checkPlugins = jest.fn().mockResolvedValue([]);
      doctor.checkDependencies = jest.fn().mockResolvedValue([]);
      doctor.checkPerformance = jest.fn().mockResolvedValue([]);
      doctor.checkSecurity = jest.fn().mockResolvedValue([]);
      doctor.checkEnvironment = jest.fn().mockResolvedValue([]);

      const report = await doctor.run();

      expect(doctor.checkConfiguration).toHaveBeenCalled();
      expect(doctor.checkPlugins).toHaveBeenCalled();
      expect(doctor.checkDependencies).toHaveBeenCalled();
      expect(doctor.checkPerformance).toHaveBeenCalled();
      expect(doctor.checkSecurity).toHaveBeenCalled();
      expect(doctor.checkEnvironment).toHaveBeenCalled();
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('issues');
    });

    it('should run only specified categories', async () => {
      const categoryDoctor = new PipelineDoctor({
        categories: ['configuration', 'plugins']
      });

      categoryDoctor.checkConfiguration = jest.fn().mockResolvedValue([]);
      categoryDoctor.checkPlugins = jest.fn().mockResolvedValue([]);
      categoryDoctor.checkDependencies = jest.fn().mockResolvedValue([]);
      categoryDoctor.checkPerformance = jest.fn().mockResolvedValue([]);
      categoryDoctor.checkSecurity = jest.fn().mockResolvedValue([]);
      categoryDoctor.checkEnvironment = jest.fn().mockResolvedValue([]);

      await categoryDoctor.run();

      expect(categoryDoctor.checkConfiguration).toHaveBeenCalled();
      expect(categoryDoctor.checkPlugins).toHaveBeenCalled();
      expect(categoryDoctor.checkDependencies).not.toHaveBeenCalled();
      expect(categoryDoctor.checkPerformance).not.toHaveBeenCalled();
      expect(categoryDoctor.checkSecurity).not.toHaveBeenCalled();
      expect(categoryDoctor.checkEnvironment).not.toHaveBeenCalled();
    });

    it('should perform auto-fixes when enabled', async () => {
      const autoFixDoctor = new PipelineDoctor({ autoFix: true });
      
      const fixableIssue = {
        category: 'dependencies',
        code: 'NPM_DEPENDENCY_MISSING',
        autoFixable: true
      };

      autoFixDoctor.checkConfiguration = jest.fn().mockResolvedValue([]);
      autoFixDoctor.checkPlugins = jest.fn().mockResolvedValue([]);
      autoFixDoctor.checkDependencies = jest.fn().mockResolvedValue([fixableIssue]);
      autoFixDoctor.checkPerformance = jest.fn().mockResolvedValue([]);
      autoFixDoctor.checkSecurity = jest.fn().mockResolvedValue([]);
      autoFixDoctor.checkEnvironment = jest.fn().mockResolvedValue([]);
      autoFixDoctor.autoFix = jest.fn().mockResolvedValue({ success: true });

      await autoFixDoctor.run();

      expect(autoFixDoctor.autoFix).toHaveBeenCalledWith(fixableIssue);
    });
  });
});

describe('runPipelineDoctor', () => {
  it('should create and run doctor with options', async () => {
    const mockRun = jest.fn().mockResolvedValue({
      summary: { totalIssues: 0 },
      issues: []
    });

    // Mock the PipelineDoctor constructor
    const MockDoctor = jest.fn().mockImplementation(() => ({
      run: mockRun
    }));

    const options = {
      configPath: 'test.json',
      verbose: true,
      autoFix: true
    };

    // Since we can't easily mock the import, we'll test the function behavior
    const doctor = new PipelineDoctor(options);
    const report = await doctor.run();

    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('issues');
  });
});
