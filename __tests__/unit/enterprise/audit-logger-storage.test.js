/**
 * AuditLogger storage (3.9): the constructor writes nothing, folders are
 * created on the first flush, the default folder warns that it is
 * deprecated, and a directory that can't be written never ends the process
 * (BH-13, BH-14).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const auditLoggingPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "src",
  "enterprise",
  "audit-logging.js",
);

// Each case runs in a child process with a fresh working directory, so an
// unhandled rejection would end that process, not the test runner.
function run(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-storage-"));
  try {
    fs.writeFileSync(path.join(dir, "afile"), "x");
    const env = { ...process.env, LOG_LEVEL: "warn" };
    delete env.NODE_ENV;
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        `const { AuditLogger } = require(${JSON.stringify(auditLoggingPath)});
const report = (o) => { console.log("RESULT " + JSON.stringify(o)); process.exit(0); };
${script}`,
      ],
      { cwd: dir, env, encoding: "utf8", timeout: 20000 },
    );
    const output = child.stdout + child.stderr;
    const line = child.stdout.split("\n").find((l) => l.startsWith("RESULT "));
    return {
      status: child.status,
      result: line ? JSON.parse(line.slice(7)) : null,
      warnings: output.split("\n").filter((l) => /could not write/.test(l))
        .length,
      entries: fs.readdirSync(dir).sort(),
      output,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const login = `{ _userId: "u1", _tenantId: "t1", method: "password", success: true }`;

describe("AuditLogger without a logDir", () => {
  test("uses the deprecated default folder, created on the first write, and warns once", () => {
    const { result, entries, output } = run(`
      (async () => {
        const fs = require("fs");
        const logger = new AuditLogger({ encryptionKey: "k".repeat(64), realtimeEnabled: false });
        new AuditLogger({ encryption: false, realtimeEnabled: false });
        await new Promise((r) => logger.once("audit_system_initialized", r));
        const before = fs.existsSync(".rag-enterprise");
        await logger.logAuthentication(${login});
        await logger._flushLogs();
        const q = await logger.queryLogs({ tenantId: "t1" });
        const v = await logger.verifyIntegrity();
        report({
          before,
          after: fs.readdirSync(".rag-enterprise/audit-logs").sort(),
          found: q.total,
          verified: v.verified,
        });
      })();
    `);
    expect(result).toEqual({
      before: false,
      after: ["archived", "daily", "integrity"],
      found: 1,
      verified: true,
    });
    expect(entries).toEqual([".rag-enterprise", "afile"]);
    const warnings = output.match(/RAG_DEP_AUDIT_LOG_DIR/g) || [];
    expect(warnings).toHaveLength(1);
    expect(output).toMatch(
      /deprecated and will be removed in 4.0; set the logDir option/,
    );
  });

  test("creating one writes nothing to the working directory", () => {
    const { entries } = run(`
      new AuditLogger({ encryption: false });
      setTimeout(() => report({}), 200);
    `);
    expect(entries).toEqual(["afile"]);
  });
});

describe("AuditLogger memoryLimit", () => {
  test("keeps only the latest memoryLimit events while writes fail", () => {
    const { result } = run(`
      (async () => {
        const logger = new AuditLogger({ logDir: "afile/logs", encryption: false, realtimeEnabled: false, memoryLimit: 3, batchSize: 1 });
        const dropped = [];
        logger.on("events_dropped", (e) => dropped.push(e));
        // Records are numbered when they are written, so the kept ones are
        // told apart by user
        for (let i = 1; i <= 5; i++) await logger.logAuthentication({ _userId: "u" + i, _tenantId: "t1", method: "password", success: true });
        report({
          kept: logger.logBuffer.map((l) => l.userId),
          dropped,
          total: logger.droppedEvents,
        });
      })();
    `);
    expect(result).toEqual({
      kept: ["u3", "u4", "u5"],
      dropped: [
        { count: 1, totalDropped: 1, stage: "file" },
        { count: 1, totalDropped: 2, stage: "file" },
      ],
      total: 2,
    });
  });

  test("the warning says how many events were dropped", () => {
    const { output } = run(`
      (async () => {
        const logger = new AuditLogger({ logDir: "afile/logs", encryption: false, realtimeEnabled: false, memoryLimit: 2, batchSize: 1 });
        for (let i = 0; i < 5; i++) await logger.logAuthentication(${login});
        report({});
      })();
    `);
    expect(output).toMatch(/0 events dropped so far/);
    expect(output.match(/1 event dropped \(1 in all\)/g)).toHaveLength(1);
  });

  test("an undefined memoryLimit falls back to the default", () => {
    const { result } = run(`
      const logger = new AuditLogger({ logDir: "logs", encryption: false, memoryLimit: undefined });
      report({ limit: logger._config.memoryLimit });
    `);
    expect(result).toEqual({ limit: 10000 });
  });
});

describe("AuditLogger with a logDir", () => {
  test("creates its folders on the first flush, not in the constructor", () => {
    const { result } = run(`
      (async () => {
        const fs = require("fs");
        const logger = new AuditLogger({ logDir: "logs", encryption: false, realtimeEnabled: false });
        await new Promise((r) => logger.once("audit_system_initialized", r));
        const before = fs.existsSync("logs");
        await logger.logAuthentication(${login});
        await logger._flushLogs();
        report({
          before,
          after: fs.readdirSync("logs").sort(),
          chain: fs.existsSync("logs/integrity/chain.json"),
          verified: (await logger.verifyIntegrity()).verified,
        });
      })();
    `);
    expect(result).toEqual({
      before: false,
      after: ["archived", "daily", "integrity"],
      chain: true,
      verified: true,
    });
  });

  test("a CRITICAL event to a folder that can't be created resolves and warns once", () => {
    const { status, result, warnings } = run(`
      (async () => {
        const logger = new AuditLogger({ logDir: "afile/logs", encryption: false, realtimeEnabled: false });
        const failed = [];
        logger.on("flush_failed", (e) => failed.push(e.count));
        const event = { _tenantId: "t1", _action: "violation", standard: "GDPR", result: "failure" };
        await logger.logComplianceEvent(event);
        await logger.logComplianceEvent(event);
        report({ failed, buffered: logger.logBuffer.length });
      })();
    `);
    expect(status).toBe(0);
    expect(result).toEqual({ failed: [1, 2], buffered: 2 });
    expect(warnings).toBe(1);
  });

  test("the flush timer on a folder that can't be created doesn't end the process", () => {
    const { status, result, warnings } = run(`
      const logger = new AuditLogger({ logDir: "afile/logs", encryption: false, flushInterval: 20 });
      let failures = 0;
      logger.on("flush_failed", () => failures++);
      logger.logAuthentication(${login});
      setTimeout(() => report({ alive: true, retried: failures > 1 }), 300);
    `);
    expect(status).toBe(0);
    expect(result).toEqual({ alive: true, retried: true });
    expect(warnings).toBe(1);
  });
});

// The daily file's events, chain.json's sequence, and whether the log
// verifies: verifyIntegrity() checks the chain links and that chain.json
// ends at the last record, so each event must be there once, in order
const inspect = `
  const fs = require("fs");
  const inspect = async (logger) => {
    const dir = "logs/daily";
    const lines = fs.readdirSync(dir).flatMap((f) =>
      fs.readFileSync(dir + "/" + f, "utf8").trim().split("\\n").filter(Boolean));
    const logs = lines.map((l) => JSON.parse(l));
    const chain = JSON.parse(fs.readFileSync("logs/integrity/chain.json", "utf8"));
    const { verified } = await logger.verifyIntegrity();
    return { file: logs.map((l) => l.sequence), verified, chainSequence: chain.sequence };
  };
`;

describe("AuditLogger writes each event to the file once", () => {
  test("a chain file write that fails once", () => {
    const { result } = run(`
      ${inspect}
      (async () => {
        const logger = new AuditLogger({ logDir: "logs", encryption: false, realtimeEnabled: false });
        const persist = logger._persistChainState.bind(logger);
        let calls = 0;
        logger._persistChainState = async () => {
          if (++calls === 1) throw new Error("chain locked");
          return persist();
        };
        const failures = [];
        logger.on("chain_failed", (e) => failures.push(e));
        await logger.logAuthentication(${login});
        await logger._flushLogs();
        await logger.logAuthentication(${login});
        await logger._flushLogs();
        report({ after: await inspect(logger), failures });
      })();
    `);
    expect(result).toEqual({
      after: { file: [1, 2], verified: true, chainSequence: 2 },
      failures: [{ error: "chain locked", count: 1 }],
    });
  });

  test("a chain file write that keeps failing is retried on a flush with nothing new", () => {
    const { result } = run(`
      ${inspect}
      (async () => {
        const logger = new AuditLogger({ logDir: "logs", encryption: false, realtimeEnabled: false });
        const persist = logger._persistChainState.bind(logger);
        let failing = true;
        logger._persistChainState = async () => {
          if (failing) throw new Error("chain locked");
          return persist();
        };
        let failures = 0;
        logger.on("chain_failed", () => failures++);
        await logger.logAuthentication(${login});
        await logger.logAuthentication(${login});
        await logger._flushLogs();
        await logger._flushLogs();
        failing = false;
        await logger._flushLogs();
        report({ after: await inspect(logger), failures });
      })();
    `);
    expect(result).toEqual({
      after: { file: [1, 2], verified: true, chainSequence: 2 },
      failures: 2,
    });
  });
});

describe("AuditLogger with a listener that throws", () => {
  test("a logs_flushed listener that throws on the first flush", () => {
    const { result } = run(`
      ${inspect}
      const unhandled = [];
      process.on("unhandledRejection", (e) => unhandled.push(String(e)));
      (async () => {
        const logger = new AuditLogger({ logDir: "logs", encryption: false, realtimeEnabled: false });
        let calls = 0;
        logger.on("logs_flushed", () => {
          if (++calls === 1) throw new Error("listener bug");
        });
        await logger.logAuthentication(${login});
        await logger._flushLogs();
        await logger.logAuthentication(${login});
        await logger._flushLogs();
        const after = await inspect(logger);
        setTimeout(() => report({ after, calls, unhandled }), 50);
      })();
    `);
    expect(result).toEqual({
      after: { file: [1, 2], verified: true, chainSequence: 2 },
      calls: 2,
      unhandled: [],
    });
  });

  test("an events_dropped listener that throws", () => {
    const { result } = run(`
      ${inspect}
      const unhandled = [];
      process.on("unhandledRejection", (e) => unhandled.push(String(e)));
      (async () => {
        // The first two appends fail, so the buffer drops past memoryLimit
        const logger = new AuditLogger({ logDir: "logs", encryption: false, realtimeEnabled: false, memoryLimit: 2 });
        const append = fs.promises.appendFile;
        let appends = 0;
        fs.promises.appendFile = async (...args) => {
          if (++appends <= 2) throw new Error("disk full");
          return append(...args);
        };
        let drops = 0;
        logger.on("events_dropped", () => {
          drops++;
          throw new Error("listener bug");
        });
        for (let i = 0; i < 3; i++) await logger.logAuthentication(${login});
        await logger._flushLogs();
        await logger.logAuthentication(${login});
        await logger._flushLogs();
        await logger._flushLogs();
        const after = await inspect(logger);
        setTimeout(() => report({
          after,
          drops,
          dropped: logger.droppedEvents,
          unhandled,
        }), 50);
      })();
    `);
    expect(result).toEqual({
      after: { file: [1, 2], verified: true, chainSequence: 2 },
      drops: 2,
      dropped: 2,
      unhandled: [],
    });
  });
});
