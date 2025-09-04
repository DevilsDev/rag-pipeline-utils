/**
 * Integration tests for Enhanced CLI Integration Tests
 * Tests CLI commands with real file system operations and plugin interactions
 * @e2e
 */
// Jest globals are available by default
const fs = require("fs/promises");
const fss = require("fs");
const path = require("path");
const { spawn } = require("child_process");

jest.setTimeout(60000);

// Resolve CLI path robustly (bin/cli.js, dist/cli.js, or cli.js)
const CLI_CANDIDATES = [
  path.resolve(__dirname, "../../bin/cli.js"),
  path.resolve(__dirname, "../../dist/cli.js"),
  path.resolve(__dirname, "../../cli.js"),
];
const CLI_PATH =
  CLI_CANDIDATES.find((p) => fss.existsSync(p)) || CLI_CANDIDATES[0];

const TEST_CONFIG_DIR = path.resolve(__dirname, "../fixtures/cli");

// Helper function to run CLI commands
function runCLI(_args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 30000;

    const child = spawn(process.execPath, [CLI_PATH, ..._args], {
      cwd: options.cwd || TEST_CONFIG_DIR,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // make CLI deterministic & test-friendly
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        CI: "1",
        RAG_PIPELINE_TEST_MODE: "1",
        ...options.env,
      },
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (_) {}
      reject(
        new Error(
          `CLI timed out after ${timeoutMs}ms\nSTDERR: ${stderr}\nSTDOUT: ${stdout}`,
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr, success: code === 0 });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    if (options.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

// Setup test fixtures
async function setupTestFixtures() {
  // Always recreate from scratch
  await fs
    .rm(TEST_CONFIG_DIR, { recursive: true, force: true })
    .catch(() => {});
  await fs.mkdir(TEST_CONFIG_DIR, { recursive: true });

  // Create test configuration files
  const validConfig = {
    metadata: {
      name: "test-project",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    },
    plugins: {
      loader: { "file-loader": "latest" },
      embedder: { "openai-embedder": "latest" },
      retriever: { "vector-retriever": "latest" },
      llm: { "openai-llm": "latest" },
    },
    pipeline: {
      stages: ["loader", "embedder", "retriever", "llm"],
      middleware: {
        retry: { enabled: true, maxAttempts: 3 },
        logging: { enabled: true, level: "info" },
      },
    },
    performance: {
      parallel: { enabled: true, maxConcurrency: 3 },
      streaming: { enabled: true, batchSize: 10, maxMemoryMB: 512 },
    },
    observability: {
      eventLogging: { enabled: true },
      tracing: { enabled: false },
      metrics: { enabled: true },
    },
  };

  const invalidConfig = { plugins: "invalid-format" };

  const legacyConfig = {
    plugins: {
      loader: "file-loader",
      embedder: "openai-embedder",
      retriever: "vector-retriever",
      llm: "openai-llm",
    },
  };

  await fs.writeFile(
    path.join(TEST_CONFIG_DIR, "valid.ragrc.json"),
    JSON.stringify(validConfig, null, 2),
  );
  await fs.writeFile(
    path.join(TEST_CONFIG_DIR, "invalid.ragrc.json"),
    JSON.stringify(invalidConfig, null, 2),
  );
  await fs.writeFile(
    path.join(TEST_CONFIG_DIR, "legacy.ragrc.json"),
    JSON.stringify(legacyConfig, null, 2),
  );

  // Create test document
  await fs.writeFile(
    path.join(TEST_CONFIG_DIR, "test-document.txt"),
    "This is a test document for RAG pipeline ingestion testing.",
  );

  // Create package.json for dependency checks
  const packageJson = {
    name: "test-project",
    version: "1.0.0",
    dependencies: {
      commander: "^9.0.0",
      inquirer: "^8.0.0",
    },
  };

  await fs.writeFile(
    path.join(TEST_CONFIG_DIR, "package.json"),
    JSON.stringify(packageJson, null, 2),
  );
}

// Cleanup test fixtures
async function cleanupTestFixtures() {
  try {
    await fs.rm(TEST_CONFIG_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe("Enhanced CLI Integration Tests", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  beforeAll(async () => {
    await setupTestFixtures();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe("CLI Help and Version", () => {
    it("should display help information", async () => {
      const result = await runCLI(["--help"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("Enterprise-grade RAG pipeline toolkit");
      expect(result.stdout).toContain("init");
      expect(result.stdout).toContain("doctor");
      expect(result.stdout).toContain("ingest");
      expect(result.stdout).toContain("query");
      expect(result.stdout).toContain("plugin");
      expect(result.stdout).toContain("config");
      expect(result.stdout).toContain("Examples:");
    });

    it("should display version information", async () => {
      const result = await runCLI(["--version"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it("should show extended help with examples", async () => {
      const result = await runCLI(["--help"]);
      expect(result.stdout).toContain("rag-pipeline init --interactive");
      expect(result.stdout).toContain("rag-pipeline doctor --auto-fix");
      expect(result.stdout).toContain("rag-pipeline plugin search openai");
    });
  });

  describe("Global Options", () => {
    it("should handle dry-run flag", async () => {
      const result = await runCLI(["--dry-run", "ingest", "test-document.txt"]);
      expect(result.stdout).toContain("🧪 Dry run: Would ingest document");
      expect(result.stdout).toContain("File: test-document.txt");
    });

    it("should handle verbose flag", async () => {
      const result = await runCLI(["--verbose", "info", "--system"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("System:");
    });

    it("should handle custom config path", async () => {
      const result = await runCLI(["--config", "valid.ragrc.json", "validate"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("Validating configuration");
    });
  });

  describe("Init Command", () => {
    it("should show dry-run for init command", async () => {
      const result = await runCLI([
        "--dry-run",
        "init",
        "--output",
        "new-config.json",
      ]);
      expect(result.stdout).toContain(
        "🧪 Dry run: Would initialize RAG pipeline configuration",
      );
      expect(result.stdout).toContain("Output file: new-config.json");
    });

    it("should detect existing configuration file", async () => {
      const result = await runCLI([
        "init",
        "--output",
        "valid.ragrc.json",
        "--no-interactive",
      ]);
      expect(result.stdout).toContain("Configuration file already exists");
      expect(result.stdout).toContain("Use --force to overwrite");
    });

    it("should create basic configuration when not interactive", async () => {
      const outputPath = path.join(TEST_CONFIG_DIR, "basic-config.json");
      const result = await runCLI([
        "init",
        "--output",
        "basic-config.json",
        "--no-interactive",
      ]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("Basic configuration created");

      const configExists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);
      expect(configExists).toBe(true);

      const config = JSON.parse(await fs.readFile(outputPath, "utf-8"));
      expect(config).toHaveProperty("plugins");
      expect(config).toHaveProperty("metadata");
      expect(config.metadata.name).toBeDefined();
    });
  });

  describe("Doctor Command", () => {
    it("should run basic diagnostics", async () => {
      const result = await runCLI(["--config", "valid.ragrc.json", "doctor"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("🏥 Running pipeline diagnostics");
      expect(result.stdout).toMatch(/✅|⚠️|❌/);
    });

    it("should detect configuration issues", async () => {
      const result = await runCLI([
        "--config",
        "invalid.ragrc.json",
        "doctor",
        "--category",
        "configuration",
      ]);
      expect(result.stdout).toContain("Configuration Issues");
      expect(result.stdout).toMatch(/❌|⚠️/);
    });

    it("should save diagnostic report", async () => {
      const reportPath = path.join(TEST_CONFIG_DIR, "diagnostic-report.json");
      const result = await runCLI([
        "--config",
        "valid.ragrc.json",
        "doctor",
        "--report",
        "diagnostic-report.json",
      ]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("Diagnostic report saved");

      const reportExists = await fs
        .access(reportPath)
        .then(() => true)
        .catch(() => false);
      expect(reportExists).toBe(true);

      const report = JSON.parse(await fs.readFile(reportPath, "utf-8"));
      expect(report).toHaveProperty("summary");
      expect(report).toHaveProperty("categories");
      expect(report).toHaveProperty("issues");
    });

    it("should run specific diagnostic categories", async () => {
      const result = await runCLI([
        "--config",
        "valid.ragrc.json",
        "doctor",
        "--category",
        "configuration",
        "plugins",
      ]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("Configuration");
      expect(result.stdout).toContain("Plugins");
    });
  });

  describe("Validate Command", () => {
    it("should validate valid configuration", async () => {
      const result = await runCLI(["--config", "valid.ragrc.json", "validate"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("✅ Configuration is valid");
    });

    it("should detect invalid configuration", async () => {
      const result = await runCLI([
        "--config",
        "invalid.ragrc.json",
        "validate",
      ]);
      expect(result.stdout).toContain("❌ Configuration validation failed");
    });

    it("should detect legacy format", async () => {
      const result = await runCLI([
        "--config",
        "legacy.ragrc.json",
        "validate",
      ]);
      expect(result.stdout).toMatch(/legacy format|consider upgrading/i);
    });
  });

  describe("Config Commands", () => {
    it("should show configuration", async () => {
      const result = await runCLI([
        "--config",
        "valid.ragrc.json",
        "config",
        "show",
      ]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("plugins");
      expect(result.stdout).toContain("metadata");
    });

    it("should show specific configuration section", async () => {
      const result = await runCLI([
        "--config",
        "valid.ragrc.json",
        "config",
        "show",
        "--section",
        "metadata",
      ]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("test-project");
      expect(result.stdout).toContain("1.0.0");
    });

    it("should get configuration value", async () => {
      const result = await runCLI([
        "--config",
        "valid.ragrc.json",
        "config",
        "get",
        "metadata.name",
      ]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("test-project");
    });

    it("should handle missing configuration key", async () => {
      const result = await runCLI([
        "--config",
        "valid.ragrc.json",
        "config",
        "get",
        "missing.key",
      ]);
      expect(result.stdout).toContain("❌ Key not found");
    });

    it("should set configuration value", async () => {
      const tempConfig = path.join(TEST_CONFIG_DIR, "temp-config.json");
      await fs.copyFile(
        path.join(TEST_CONFIG_DIR, "valid.ragrc.json"),
        tempConfig,
      );

      const result = await runCLI([
        "--config",
        "temp-config.json",
        "config",
        "set",
        "metadata.description",
        "Updated description",
      ]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("✅ Configuration updated");

      const updatedConfig = JSON.parse(await fs.readFile(tempConfig, "utf-8"));
      expect(updatedConfig.metadata.description).toBe("Updated description");
    });
  });

  describe("Info Command", () => {
    it("should show system information", async () => {
      const result = await runCLI(["info", "--system"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("📊 RAG Pipeline Information");
      expect(result.stdout).toContain("System:");
      expect(result.stdout).toContain(`Node.js: ${process.version}`);
      expect(result.stdout).toContain(`Platform: ${process.platform}`);
    });

    it("should show configuration summary", async () => {
      const result = await runCLI([
        "--config",
        "valid.ragrc.json",
        "info",
        "--config",
      ]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("Configuration:");
      expect(result.stdout).toContain("Format: Enhanced");
    });

    it("should show all information by default", async () => {
      const result = await runCLI(["--config", "valid.ragrc.json", "info"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("System:");
      expect(result.stdout).toContain("Configuration:");
    });
  });

  describe("Completion Command", () => {
    it("should generate bash completion", async () => {
      const result = await runCLI(["completion", "bash"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("_rag_pipeline_completions");
      expect(result.stdout).toContain("complete -F");
    });

    it("should generate zsh completion", async () => {
      const result = await runCLI(["completion", "zsh"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("#compdef rag-pipeline");
    });

    it("should generate fish completion", async () => {
      const result = await runCLI(["completion", "fish"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("complete -c rag-pipeline");
    });

    it("should handle unsupported shell", async () => {
      const result = await runCLI(["completion", "unsupported"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain(
        "Completion not available for unsupported",
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle unknown commands gracefully", async () => {
      const result = await runCLI(["unknown-command"]);
      expect(result.success).toBe(false);
      expect(result.stderr).toMatch(/unknown command|error/i);
    });

    it("should handle missing configuration file", async () => {
      const result = await runCLI(["--config", "nonexistent.json", "validate"]);
      expect(result.success).toBe(false);
      expect(result.stderr).toMatch(/not found|error/i);
    });

    it("should handle invalid JSON configuration", async () => {
      const invalidJsonPath = path.join(TEST_CONFIG_DIR, "invalid.json");
      await fs.writeFile(invalidJsonPath, "{ invalid json }");

      const result = await runCLI(["--config", "invalid.json", "validate"]);
      expect(result.success).toBe(false);
      expect(result.stderr).toMatch(/json|syntax|error/i);
    });
  });

  describe("Integration with Observability", () => {
    it("should handle trace flag in dry-run", async () => {
      const result = await runCLI([
        "--dry-run",
        "ingest",
        "test-document.txt",
        "--trace",
      ]);
      expect(result.stdout).toContain("Tracing: enabled");
    });

    it("should handle stats flag in dry-run", async () => {
      const result = await runCLI([
        "--dry-run",
        "query",
        "What is this about?",
        "--stats",
      ]);
      expect(result.stdout).toContain("🧪 Dry run: Would execute query");
    });

    it("should handle export-observability flag in dry-run", async () => {
      const result = await runCLI([
        "--dry-run",
        "ingest",
        "test-document.txt",
        "--export-observability",
        "observability.json",
      ]);
      expect(result.stdout).toContain("🧪 Dry run: Would ingest document");
    });
  });

  describe("Performance and Memory", () => {
    it("should handle parallel processing flag", async () => {
      const result = await runCLI([
        "--dry-run",
        "ingest",
        "test-document.txt",
        "--parallel",
        "--max-concurrency",
        "5",
      ]);
      expect(result.stdout).toContain("Parallel processing: enabled");
    });

    it("should handle streaming flag", async () => {
      const result = await runCLI([
        "--dry-run",
        "ingest",
        "test-document.txt",
        "--streaming",
        "--batch-size",
        "20",
      ]);
      expect(result.stdout).toContain("Streaming: enabled");
    });

    it("should handle memory limits", async () => {
      const result = await runCLI([
        "--dry-run",
        "ingest",
        "test-document.txt",
        "--max-memory",
        "1024",
      ]);
      expect(result.success).toBe(true);
    });
  });

  describe("CLI UX Features", () => {
    it("should show document preview when requested", async () => {
      const result = await runCLI([
        "--dry-run",
        "ingest",
        "test-document.txt",
        "--preview",
      ]);
      expect(result.stdout).toContain("📄 Document Preview:");
    });

    it("should validate files when requested", async () => {
      const result = await runCLI([
        "--dry-run",
        "ingest",
        "test-document.txt",
        "--validate",
      ]);
      expect(result.stdout).toContain("File validation passed");
    });

    it("should show query explanation when requested", async () => {
      const result = await runCLI([
        "--dry-run",
        "query",
        "What is this document about?",
        "--explain",
      ]);
      expect(result.stdout).toContain("🔍 Query Explanation:");
      expect(result.stdout).toContain("Processing steps:");
    });
  });

  describe("Plugin Marketplace Integration", () => {
    it("should show plugin commands in help", async () => {
      const result = await runCLI(["plugin", "--help"]);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("search");
      expect(result.stdout).toContain("install");
      expect(result.stdout).toContain("publish");
    });

    it("should handle plugin search dry-run", async () => {
      const result = await runCLI(["--dry-run", "plugin", "search", "openai"]);
      expect(result.success).toBe(true);
    });
  });
});

describe("CLI Performance Tests", () => {
  beforeAll(async () => {
    await setupTestFixtures();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  it("should start CLI quickly", async () => {
    const startTime = Date.now();
    const result = await runCLI(["--version"]);
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(5000);
  });

  it("should handle help command efficiently", async () => {
    const startTime = Date.now();
    const result = await runCLI(["--help"]);
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(3000);
  });

  it("should validate configuration quickly", async () => {
    const startTime = Date.now();
    const result = await runCLI(["--config", "valid.ragrc.json", "validate"]);
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(5000);
  });
});
