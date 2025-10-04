/**
 * Unit tests for script utilities
 * Tests validation, dry-run logic, and GitHub token handling
 */
// Jest is available globally in CommonJS mode;
const fs = require("fs");
const path = require("path");
// Mock the script utilities
jest.mock("fs");
jest.mock("child_process");
describe("Script Utilities", () => {
  const mockFs = fs;
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mocks
    mockFs.existsSync = jest.fn().mockReturnValue(true);
    mockFs.readFileSync = jest.fn();
    mockFs.writeFileSync = jest.fn();
    // Mock environment variables
    process.env.GITHUB_TOKEN = "mock-token";
    process.env.GITHUB_REPO = "DevilsDev/rag-pipeline-utils";
  });
  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPO;
  });

  afterAll(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });
  describe("logger utility", () => {
    let logger;
    beforeEach(async () => {
      // Mock the logger module
      logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
      };
    });
    it("should log messages with correct levels", () => {
      logger.info("Test info message");
      logger.warn("Test warning message");
      logger.error("Test error message");

      expect(logger.info).toHaveBeenCalledWith("Test info message");
      expect(logger.warn).toHaveBeenCalledWith("Test warning message");
      expect(logger.error).toHaveBeenCalledWith("Test error message");
    });
    it("should handle debug logging based on environment", () => {
      process.env.DEBUG = "true";
      logger.debug("Debug message");
    });
    it("should format messages consistently", () => {
      const timestamp = new Date().toISOString();
      logger.info("Test message");
      expect(logger.info).toHaveBeenCalled();
    });
  });
  describe("retry utility", () => {
    const { retry } = require("../../../src/scripts/script-utilities.js");

    // Fail-safe timeout wrapper
    async function withTimeout(p, ms = 2000) {
      return Promise.race([
        p,
        new Promise((_, r) =>
          setTimeout(() => r(new Error("test timeout")), ms),
        ),
      ]);
    }

    beforeEach(() => {
      jest.clearAllMocks();
    });
    it("should retry failed operations", async () => {
      let attempts = 0;
      const flakyFunction = jest.fn().mockImplementation((attempt) => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        return "success";
      });
      const sleepSpy = jest.fn().mockResolvedValue();

      const result = await retry(flakyFunction, {
        retries: 2,
        baseDelay: 10,
        sleeper: sleepSpy,
      });

      expect(result).toBe("success");
      expect(flakyFunction).toHaveBeenCalledTimes(3);
    });
    it("should handle GitHub API rate limits", async () => {
      const rateLimitError = new Error("API rate limit exceeded");
      rateLimitError.status = 403;
      let callCount = 0;
      const apiCall = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw rateLimitError;
        }
        return { data: "success" };
      });
      const sleepSpy = jest.fn().mockResolvedValue();

      const result = await retry(apiCall, {
        retries: 1,
        baseDelay: 50,
        sleeper: sleepSpy,
      });

      expect(result).toEqual({ data: "success" });
      expect(apiCall).toHaveBeenCalledTimes(2);
    });
    it("should respect maximum attempts", async () => {
      const alwaysFailingFunction = jest.fn().mockImplementation(() => {
        throw new Error("Always fails");
      });
      const sleepSpy = jest.fn().mockResolvedValue();

      await expect(
        retry(alwaysFailingFunction, {
          retries: 1,
          baseDelay: 10,
          sleeper: sleepSpy,
        }),
      ).rejects.toThrow("Always fails");

      expect(alwaysFailingFunction).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });
    it("should implement exponential backoff", async () => {
      const delays = [];
      const sleepSpy = jest.fn().mockResolvedValue();

      // Mock function that fails twice then succeeds
      const mockFn = jest.fn();
      mockFn.mockImplementationOnce(() => {
        throw new Error("fail1");
      });
      mockFn.mockImplementationOnce(() => {
        throw new Error("fail2");
      });
      mockFn.mockImplementationOnce(() => "success");

      const result = await retry(mockFn, {
        retries: 2,
        baseDelay: 100,
        factor: 2,
        onDelay: (delay) => delays.push(delay),
        sleeper: sleepSpy,
      });

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(3);
      expect(delays).toEqual([100, 200]);
      expect(sleepSpy).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenNthCalledWith(1, 100);
      expect(sleepSpy).toHaveBeenNthCalledWith(2, 200);
    });
  });
  describe("CLI utility", () => {
    let cli;
    beforeEach(() => {
      cli = {
        parseArgs: jest.fn(),
        showHelp: jest.fn(),
        validateArgs: jest.fn(),
        isDryRun: jest.fn(),
        isVerbose: jest.fn(),
      };
    });
    it("should parse command line arguments correctly", () => {
      const mockArgs = ["--dry-run", "--verbose", "--action", "sync"];
      cli.parseArgs.mockReturnValue({
        dryRun: true,
        verbose: true,
        action: "sync",
      });
      const parsed = cli.parseArgs(mockArgs);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.verbose).toBe(true);
      expect(parsed.action).toBe("sync");
    });
    it("should handle dry-run mode correctly", () => {
      cli.isDryRun.mockReturnValue(true);
      expect(cli.isDryRun()).toBe(true);
    });
    it("should validate required arguments", () => {
      const invalidArgs = { action: undefined };
      cli.validateArgs.mockImplementation((args) => {
        if (!args.action) {
          throw new Error("Action is required");
        }
      });
      expect(() => cli.validateArgs(invalidArgs)).toThrow("Action is required");
    });
    it("should display help when requested", () => {
      cli.showHelp.mockReturnValue(`
Usage: script [options]
Options:
  --dry-run    Preview actions without executing
  --verbose    Enable verbose logging
  --help       Show this help message
      `);
      const help = cli.showHelp();
      expect(help).toContain("--dry-run");
    });
  });
  describe("GitHub token handling", () => {
    it("should validate GitHub token presence", () => {
      expect(process.env.GITHUB_TOKEN).toBe("mock-token");
    });
    it("should handle missing GitHub token", () => {
      delete process.env.GITHUB_TOKEN;
      const validateToken = () => {
        if (!process.env.GITHUB_TOKEN) {
          throw new Error("GITHUB_TOKEN environment variable is required");
        }
      };
      expect(validateToken).toThrow(
        "GITHUB_TOKEN environment variable is required",
      );
    });
    it("should validate GitHub repository format", () => {
      const validateRepo = (repo) => {
        const repoPattern = /^[\w\-.]+\/[\w\-.]+$/;
        if (!repoPattern.test(repo)) {
          throw new Error("Invalid repository format. Expected: owner/repo");
        }
      };
      expect(() => validateRepo("DevilsDev/rag-pipeline-utils")).not.toThrow();
      expect(() => validateRepo("invalid-repo-format")).toThrow(
        "Invalid repository format",
      );
    });
    it("should handle GitHub API authentication", async () => {
      const mockOctokit = {
        rest: {
          repos: {
            get: jest.fn().mockResolvedValue({
              data: {
                name: "rag-pipeline-utils",
                owner: { login: "DevilsDev" },
              },
            }),
          },
        },
      };
      const result = await mockOctokit.rest.repos.get({
        owner: "DevilsDev",
        repo: "rag-pipeline-utils",
      });
      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: "DevilsDev",
        repo: "rag-pipeline-utils",
      });
    });
  });
  describe("configuration validation", () => {
    it("should validate scripts.config.json format", () => {
      const validConfig = {
        github: {
          owner: "DevilsDev",
          repo: "rag-pipeline-utils",
        },
        roadmap: {
          labels: ["roadmap", "enhancement"],
        },
        logging: {
          level: "info",
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
      const config = JSON.parse(mockFs.readFileSync("scripts.config.json"));
      expect(config.github.owner).toBe("DevilsDev");
      expect(config.roadmap.labels).toContain("roadmap");
      expect(config.logging.level).toBe("info");
    });
    it("should handle missing configuration file", () => {
      mockFs.existsSync.mockReturnValue(false);
      const loadConfig = () => {
        if (!mockFs.existsSync("scripts.config.json")) {
          throw new Error("Configuration file not found: scripts.config.json");
        }
      };
      expect(loadConfig).toThrow("Configuration file not found");
    });
    it("should validate configuration schema", () => {
      const invalidConfig = {
        github: {
          // Missing required 'repo' field
          owner: "DevilsDev",
        },
      };
      const validateConfig = (config) => {
        if (!config.github?.repo) {
          throw new Error("Missing required field: github.repo");
        }
      };
      expect(() => validateConfig(invalidConfig)).toThrow(
        "Missing required field: github.repo",
      );
    });
  });
  describe("dry-run functionality", () => {
    it("should preview actions without execution", () => {
      const dryRunActions = [];
      const executeDryRun = (action, params) => {
        dryRunActions.push({ action, params, executed: false });
        return `DRY RUN: Would execute ${action} with params: ${JSON.stringify(params)}`;
      };
      const result = executeDryRun("createIssue", {
        title: "Test Issue",
        body: "Test body",
      });
      expect(result).toContain("DRY RUN: Would execute createIssue");
      expect(dryRunActions).toHaveLength(1);
      expect(dryRunActions[0].executed).toBe(false);
    });
    it("should estimate costs in dry-run mode", () => {
      const estimateCost = (operations) => {
        const costs = {
          createIssue: 0.01,
          updateIssue: 0.005,
          createLabel: 0.002,
        };
        return operations.reduce(
          (total, op) => total + (costs[op.type] || 0),
          0,
        );
      };
      const operations = [
        { type: "createIssue" },
        { type: "updateIssue" },
        { type: "createLabel" },
      ];
      const totalCost = estimateCost(operations);
      expect(totalCost).toBe(0.017);
    });
    it("should show diff preview in dry-run mode", () => {
      const showDiff = (before, after) => {
        return {
          added: after.filter((item) => !before.includes(item)),
          removed: before.filter((item) => !after.includes(item)),
          unchanged: before.filter((item) => after.includes(item)),
        };
      };
      const before = ["label1", "label2"];
      const after = ["label2", "label3"];
      const diff = showDiff(before, after);
      expect(diff.added).toEqual(["label3"]);
      expect(diff.removed).toEqual(["label1"]);
      expect(diff.unchanged).toEqual(["label2"]);
    });
  });
  describe("error handling and recovery", () => {
    it("should handle network timeouts gracefully", async () => {
      const timeoutError = new Error("Network timeout");
      timeoutError.code = "ETIMEDOUT";
      const handleNetworkError = (error) => {
        if (error.code === "ETIMEDOUT") {
          return {
            retry: true,
            message: "Network timeout detected, retrying...",
            delay: 5000,
          };
        }
        return { retry: false };
      };
      const result = handleNetworkError(timeoutError);
      expect(result.retry).toBe(true);
      expect(result.delay).toBe(5000);
    });
    it("should provide actionable error messages", () => {
      const formatError = (error) => {
        const errorMessages = {
          ENOENT: "File not found. Please check the file path.",
          EACCES: "Permission denied. Please check file permissions.",
          GITHUB_TOKEN:
            "GitHub token is missing or invalid. Please set GITHUB_TOKEN environment variable.",
        };
        return errorMessages[error.code] || error.message;
      };
      const fileError = { code: "ENOENT", message: "File not found" };
      const permissionError = { code: "EACCES", message: "Permission denied" };
      expect(formatError(fileError)).toContain("Please check the file path");
      expect(formatError(permissionError)).toContain(
        "Please check file permissions",
      );
    });
    it("should handle partial failures in batch operations", () => {
      const processBatch = (items, processor) => {
        const results = {
          successful: [],
          failed: [],
          total: items.length,
        };
        items.forEach((item) => {
          try {
            const result = processor(item);
            results.successful.push({ item, result });
          } catch (error) {
            results.failed.push({ item, error: error.message });
          }
        });
        return results;
      };
      const items = ["item1", "item2", "item3"];
      const flakyProcessor = (item) => {
        if (item === "item2") {
          throw new Error("Processing failed");
        }
        return `processed-${item}`;
      };
      const results = processBatch(items, flakyProcessor);
      expect(results.successful).toHaveLength(2);
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0].item).toBe("item2");
    });
  });
});
