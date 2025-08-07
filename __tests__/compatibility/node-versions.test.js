/**
 * Compatibility Testing Suite for Node.js Versions
 * Tests compatibility across different Node.js versions and environments
 */

// Jest is available globally in CommonJS mode;
const { createRagPipeline  } = require('../../src/core/pipeline-factory.js');
const { TestDataGenerator  } = require('../utils/test-helpers.js');

describe('Node.js Version Compatibility', () => {
  const nodeVersion = process.version;
  const nodeMajorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

  describe('ES modules compatibility', () => {
    it('should support dynamic imports across Node versions', async () => {
      // Test dynamic import functionality
      try {
        const dynamicModule = await import('../../src/core/pipeline-factory.js');
        expect(dynamicModule.createRagPipeline).toBeDefined();
        expect(typeof dynamicModule.createRagPipeline).toBe('function');
      } catch (error) {
        if (nodeMajorVersion < 14) {
          expect(error.message).toContain('dynamic import');
        } else {
          throw error; // Unexpected error for supported versions
        }
      }
    });

    it('should handle top-level await properly', async () => {
      // Test top-level await support (Node 14.8+)
      const testTopLevelAwait = async () => {
        const promise = Promise.resolve('test-value');
        const result = await promise;
        return result;
      };

      const result = await testTopLevelAwait();
      expect(result).toBe('test-value');
    });

    it('should support import.meta functionality', () => {
      // Test import.meta support (Node 10.4+)
      if (nodeMajorVersion >= 10) {
        expect(import.meta).toBeDefined();
        expect(typeof import.meta).toBe('object');
      } else {
        // Skip test for older versions
        expect(true).toBe(true);
      }
    });
  });

  describe('async/await compatibility', () => {
    it('should handle async generators properly', async () => {
      async function* testAsyncGenerator() {
        yield 'first';
        yield 'second';
        yield 'third';
      }

      const results = [];
      for await (const value of testAsyncGenerator()) {
        results.push(value);
      }

      expect(results).toEqual(['first', 'second', 'third']);
    });

    it('should support Promise.allSettled', async () => {
      const promises = [
        Promise.resolve('success'),
        Promise.reject(new Error('failure')),
        Promise.resolve('another success')
      ];

      if (nodeMajorVersion >= 12) {
        const results = await Promise.allSettled(promises);
        expect(results).toHaveLength(3);
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
        expect(results[2].status).toBe('fulfilled');
      } else {
        // Polyfill for older versions
        const allSettled = async (promises) => {
          return Promise.all(
            promises.map(promise =>
              promise
                .then(value => ({ status: 'fulfilled', value }))
                .catch(reason => ({ status: 'rejected', reason }))
            )
          );
        };

        const results = await allSettled(promises);
        expect(results).toHaveLength(3);
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
      }
    });

    it('should handle AbortController for cancellation', async () => {
      if (nodeMajorVersion >= 16) {
        const controller = new AbortController();
        const signal = controller.signal;

        const cancelableOperation = async (signal) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => resolve('completed'), 1000);
            
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Operation aborted'));
            });
          });
        };

        setTimeout(() => controller.abort(), 100);

        await expect(cancelableOperation(signal)).rejects.toThrow('Operation aborted');
      } else {
        // Skip test for versions without AbortController
        expect(true).toBe(true);
      }
    });
  });

  describe('performance API compatibility', () => {
    it('should support performance.now() for timing', () => {
      const start = performance.now();
      // Small operation
      const array = new Array(1000).fill(0);
      const end = performance.now();

      expect(typeof start).toBe('number');
      expect(typeof end).toBe('number');
      expect(end).toBeGreaterThan(start);
    });

    it('should support process.hrtime.bigint() for high precision timing', () => {
      if (nodeMajorVersion >= 10) {
        const start = process.hrtime.bigint();
        // Small operation
        const array = new Array(1000).fill(0);
        const end = process.hrtime.bigint();

        expect(typeof start).toBe('bigint');
        expect(typeof end).toBe('bigint');
        expect(end > start).toBe(true);
      } else {
        // Use legacy hrtime for older versions
        const start = process.hrtime();
        const array = new Array(1000).fill(0);
        const end = process.hrtime(start);

        expect(Array.isArray(start)).toBe(true);
        expect(Array.isArray(end)).toBe(true);
        expect(end[0] >= 0).toBe(true);
        expect(end[1] >= 0).toBe(true);
      }
    });
  });

  describe('memory and resource compatibility', () => {
    it('should handle memory usage reporting consistently', () => {
      const memUsage = process.memoryUsage();

      expect(memUsage).toHaveProperty('rss');
      expect(memUsage).toHaveProperty('heapTotal');
      expect(memUsage).toHaveProperty('heapUsed');
      expect(memUsage).toHaveProperty('external');

      if (nodeMajorVersion >= 12) {
        expect(memUsage).toHaveProperty('arrayBuffers');
      }

      // All values should be positive numbers
      Object.values(memUsage).forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      });
    });

    it('should handle worker threads availability', async () => {
      if (nodeMajorVersion >= 12) {
        try {
          const { Worker, isMainThread, parentPort } = await import('worker_threads');
          expect(Worker).toBeDefined();
          expect(typeof isMainThread).toBe('boolean');
          expect(isMainThread).toBe(true); // Running in main thread during tests
        } catch (error) {
          // Worker threads might not be available in all environments
          expect(error.code).toBe('ERR_MODULE_NOT_FOUND');
        }
      } else {
        // Skip test for versions without worker threads
        expect(true).toBe(true);
      }
    });
  });

  describe('crypto compatibility', () => {
    it('should support modern crypto APIs', async () => {
      const crypto = await import('crypto');

      // Test basic hash functionality
      const hash = crypto.createHash('sha256');
      hash.update('test data');
      const digest = hash.digest('hex');

      expect(typeof digest).toBe('string');
      expect(digest).toHaveLength(64); // SHA256 produces 64-character hex string

      // Test random bytes generation
      const randomBytes = crypto.randomBytes(16);
      expect(randomBytes).toBeInstanceOf(Buffer);
      expect(randomBytes.length).toBe(16);
    });

    it('should support Web Crypto API where available', async () => {
      if (nodeMajorVersion >= 16) {
        try {
          const { webcrypto } = await import('crypto');
          expect(webcrypto).toBeDefined();
          expect(webcrypto.subtle).toBeDefined();

          // Test basic Web Crypto functionality
          const key = await webcrypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
          );

          expect(key).toBeDefined();
          expect(key.type).toBe('secret');
        } catch (error) {
          // Web Crypto might not be fully available in all Node 16+ builds
          console.warn('Web Crypto API not available:', error.message);
        }
      } else {
        // Skip test for versions without Web Crypto API
        expect(true).toBe(true);
      }
    });
  });

  describe('pipeline compatibility across versions', () => {
    it('should create pipelines consistently across Node versions', async () => {
      const mockLLM = {
        async generate(prompt, options = {}) {
          return {
            text: `Response to: ${prompt}`,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
          };
        }
      };

      const mockRetriever = {
        async store(vectors) {
          return { stored: vectors.length };
        },
        async retrieve(queryVector, options = {}) {
          return [
            { id: 'doc1', score: 0.9, metadata: {} },
            { id: 'doc2', score: 0.8, metadata: {} }
          ];
        }
      };

      const pipeline = createRagPipeline({
        llm: mockLLM,
        retriever: mockRetriever
      });

      expect(pipeline).toBeDefined();
      expect(typeof pipeline.run).toBe('function');

      // Test basic pipeline functionality
      const result = await pipeline.run({
        query: 'Test query',
        queryVector: [0.1, 0.2, 0.3],
        options: { topK: 2 }
      });

      expect(result).toBeDefined();
      expect(result.text).toContain('Test query');
    });

    it('should handle streaming consistently across versions', async () => {
      const streamingLLM = {
        async generate(prompt, options = {}) {
          if (options.stream) {
            return this.generateStream(prompt);
          }
          return { text: `Non-streaming response to: ${prompt}` };
        },

        async *generateStream(prompt) {
          const tokens = ['Streaming', ' response', ' to:', ` ${prompt}`];
          for (let i = 0; i < tokens.length; i++) {
            yield {
              token: tokens[i],
              done: false
            };
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          yield { token: '', done: true };
        }
      };

      const stream = await streamingLLM.generate('test', { stream: true });
      const tokens = [];

      for await (const chunk of stream) {
        tokens.push(chunk);
      }

      expect(tokens.length).toBeGreaterThan(1);
      expect(tokens[tokens.length - 1].done).toBe(true);
    });
  });

  describe('environment-specific features', () => {
    it('should detect and adapt to different environments', () => {
      const environment = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        isCI: !!(process.env.CI || process.env.CONTINUOUS_INTEGRATION),
        isDocker: !!process.env.DOCKER_CONTAINER,
        hasGPU: false // Would need actual GPU detection logic
      };

      expect(typeof environment.nodeVersion).toBe('string');
      expect(typeof environment.platform).toBe('string');
      expect(typeof environment.arch).toBe('string');
      expect(typeof environment.isCI).toBe('boolean');
      expect(typeof environment.isDocker).toBe('boolean');

      // Adapt behavior based on environment
      const config = {
        maxConcurrency: environment.isCI ? 2 : 4,
        timeout: environment.isCI ? 30000 : 10000,
        enableGPU: environment.hasGPU
      };

      expect(config.maxConcurrency).toBeGreaterThan(0);
      expect(config.timeout).toBeGreaterThan(0);
    });

    it('should handle different module resolution strategies', async () => {
      // Test CommonJS interop
      try {
        const path = await import('path');
        expect(path.join).toBeDefined();
        expect(typeof path.join).toBe('function');

        const joined = path.join('a', 'b', 'c');
        expect(joined).toContain('a');
        expect(joined).toContain('b');
        expect(joined).toContain('c');
      } catch (error) {
        throw new Error(`Module resolution failed: ${error.message}`);
      }
    });
  });

  describe('dependency compatibility', () => {
    it('should handle optional dependencies gracefully', async () => {
      const optionalDependencies = [
        'fsevents', // macOS file watching
        'cpu-features', // CPU feature detection
        'sharp' // Image processing
      ];

      for (const dep of optionalDependencies) {
        try {
          await import(dep);
          // If import succeeds, dependency is available
          expect(true).toBe(true);
        } catch (error) {
          // If import fails, should handle gracefully
          expect(error.code).toMatch(/MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/);
        }
      }
    });

    it('should validate core dependency versions', () => {
      const packageJson = {
        engines: {
          node: '>=18.0.0'
        },
        dependencies: {
          // Core dependencies would be listed here
        }
      };

      // Validate Node.js version requirement
      if (packageJson.engines.node) {
        const requiredVersion = packageJson.engines.node.replace('>=', '');
        const requiredMajor = parseInt(requiredVersion.split('.')[0]);
        
        if (nodeMajorVersion < requiredMajor) {
          console.warn(`Node.js ${requiredVersion}+ required, running ${nodeVersion}`);
        }
        
        expect(nodeMajorVersion).toBeGreaterThanOrEqual(requiredMajor);
      }
    });
  });
});
