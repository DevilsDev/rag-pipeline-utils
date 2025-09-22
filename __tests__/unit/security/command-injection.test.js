/**
 * @fileoverview Tests for command injection protection in doctor command
 * These tests ensure that the doctor command cannot be exploited with command injection
 */

const { PipelineDoctor } = require("../../../src/cli/doctor-command.js");

describe("Command Injection Protection", () => {
  let doctor;

  beforeEach(() => {
    doctor = new PipelineDoctor();
  });

  describe("execSafe method", () => {
    test("should reject non-allowed commands", async () => {
      await expect(doctor.execSafe("rm", ["-rf", "/"])).rejects.toThrow(
        "Command not allowed: rm",
      );
    });

    test("should reject command injection attempts in command name", async () => {
      await expect(
        doctor.execSafe("npm; rm -rf /", ["install"]),
      ).rejects.toThrow("Command not allowed: npm; rm -rf /");
    });

    test("should reject disallowed arguments for npm", async () => {
      await expect(
        doctor.execSafe("npm", ["run", "evil-script"]),
      ).rejects.toThrow("Command argument not allowed: run");
    });

    test("should reject command injection in arguments", async () => {
      await expect(
        doctor.execSafe("npm", ["install; rm -rf /"]),
      ).rejects.toThrow("Command argument not allowed: install; rm -rf /");
    });

    test("should reject attempts to inject shell metacharacters", async () => {
      const maliciousArgs = [
        "install && rm -rf /",
        "install | cat /etc/passwd",
        'install; echo "pwned"',
        "install`whoami`",
        "install$(whoami)",
        "install&& malicious-command",
      ];

      for (const arg of maliciousArgs) {
        await expect(doctor.execSafe("npm", [arg])).rejects.toThrow(
          "Command argument not allowed",
        );
      }
    });

    test("should allow safe npm commands", async () => {
      // Mock execFile to avoid actual execution
      const mockExecFile = jest
        .fn()
        .mockResolvedValue({ stdout: "success", stderr: "" });
      const originalExecFile = require("child_process").execFile;
      require("child_process").execFile = mockExecFile;

      try {
        await doctor.execSafe("npm", ["install"]);
        expect(mockExecFile).toHaveBeenCalledWith(
          "npm",
          ["install"],
          expect.objectContaining({
            shell: false,
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          }),
        );
      } finally {
        require("child_process").execFile = originalExecFile;
      }
    });

    test("should allow safe chmod commands", async () => {
      const mockExecFile = jest
        .fn()
        .mockResolvedValue({ stdout: "", stderr: "" });
      const originalExecFile = require("child_process").execFile;
      require("child_process").execFile = mockExecFile;

      try {
        await doctor.execSafe("chmod", ["600", "/safe/path/file.txt"]);
        expect(mockExecFile).toHaveBeenCalledWith(
          "chmod",
          ["600", "/safe/path/file.txt"],
          expect.objectContaining({
            shell: false,
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          }),
        );
      } finally {
        require("child_process").execFile = originalExecFile;
      }
    });

    test("should reject path traversal in chmod", async () => {
      await expect(
        doctor.execSafe("chmod", ["600", "../../../etc/passwd"]),
      ).rejects.toThrow("Command argument not allowed");
    });
  });

  describe("autoFix method - Path Traversal Protection", () => {
    test("should reject path traversal in config path", async () => {
      const doctorWithBadPath = new PipelineDoctor({
        configPath: "../../../etc/passwd",
      });

      const issue = {
        code: "INSECURE_PERMISSIONS",
        autoFixable: true,
      };

      const result = await doctorWithBadPath.autoFix(issue);
      expect(result.success).toBe(false);
      expect(result.message).toContain(
        "Invalid config path: outside current directory",
      );
    });

    test("should allow valid config paths", async () => {
      const doctorWithGoodPath = new PipelineDoctor({
        configPath: ".ragrc.json",
      });

      // Mock execSafe to avoid actual execution
      doctorWithGoodPath.execSafe = jest
        .fn()
        .mockResolvedValue({ stdout: "", stderr: "" });

      const issue = {
        code: "INSECURE_PERMISSIONS",
        autoFixable: true,
      };

      const result = await doctorWithGoodPath.autoFix(issue);
      expect(result.success).toBe(true);
      expect(result.message).toBe("Permissions updated");
    });
  });

  describe("Security boundaries", () => {
    test("should prevent shell option enabling", async () => {
      const mockExecFile = jest
        .fn()
        .mockResolvedValue({ stdout: "", stderr: "" });
      const originalExecFile = require("child_process").execFile;
      require("child_process").execFile = mockExecFile;

      try {
        await doctor.execSafe("npm", ["install"]);
        expect(mockExecFile).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({
            shell: false, // Critical: shell must always be false
          }),
        );
      } finally {
        require("child_process").execFile = originalExecFile;
      }
    });

    test("should enforce timeout limits", async () => {
      const mockExecFile = jest
        .fn()
        .mockResolvedValue({ stdout: "", stderr: "" });
      const originalExecFile = require("child_process").execFile;
      require("child_process").execFile = mockExecFile;

      try {
        await doctor.execSafe("npm", ["install"]);
        expect(mockExecFile).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({
            timeout: 30000, // 30 second timeout protection
          }),
        );
      } finally {
        require("child_process").execFile = originalExecFile;
      }
    });

    test("should enforce output buffer limits", async () => {
      const mockExecFile = jest
        .fn()
        .mockResolvedValue({ stdout: "", stderr: "" });
      const originalExecFile = require("child_process").execFile;
      require("child_process").execFile = mockExecFile;

      try {
        await doctor.execSafe("npm", ["install"]);
        expect(mockExecFile).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({
            maxBuffer: 1024 * 1024, // 1MB buffer limit
          }),
        );
      } finally {
        require("child_process").execFile = originalExecFile;
      }
    });
  });
});
