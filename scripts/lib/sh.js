/**
 * Safe child process helper using spawnSync with argv arrays
 * Cross-platform, secure, and CI-safe command execution
 */

import { spawnSync } from "child_process";
import path from "path";

/**
 * Execute a command safely using spawnSync with proper argv handling
 * @param {string} command - Command to execute
 * @param {string[]} args - Array of arguments
 * @param {object} options - Execution options
 * @returns {object} Execution result with stdout, stderr, and exitCode
 * @throws {Error} Throws on non-zero exit code unless throwOnError is false
 */
function sh(command, args = [], options = {}) {
  const defaults = {
    encoding: "utf8",
    timeout: 30000, // 30 second timeout
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
    throwOnError: true,
  };

  const execOptions = { ...defaults, ...options };

  try {
    const result = spawnSync(command, args, execOptions);

    const execResult = {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: result.status,
      success: result.status === 0,
      error: result.error,
      signal: result.signal,
    };

    // Throw on non-zero exit code unless explicitly disabled
    if (execOptions.throwOnError && result.status !== 0) {
      const cmdString = `${command} ${args.join(" ")}`;
      const errorMsg = `Command failed: ${cmdString}\nExit code: ${result.status}\nStderr: ${result.stderr}`;
      throw new Error(errorMsg);
    }

    return execResult;
  } catch (error) {
    if (execOptions.throwOnError) {
      throw error;
    }

    return {
      stdout: "",
      stderr: error.message,
      exitCode: 1,
      success: false,
      error,
      signal: null,
    };
  }
}

/**
 * Execute Node.js script safely
 * @param {string} scriptPath - Path to Node.js script
 * @param {string[]} args - Script arguments
 * @param {object} options - Execution options
 * @returns {object} Execution result
 */
function node(scriptPath, args = [], options = {}) {
  const resolvedPath = path.resolve(scriptPath);
  return sh("node", [resolvedPath, ...args], options);
}

/**
 * Execute npm command safely
 * @param {string[]} args - npm arguments
 * @param {object} options - Execution options
 * @returns {object} Execution result
 */
function npm(args = [], options = {}) {
  return sh("npm", args, options);
}

/**
 * Check if a command exists in PATH
 * @param {string} command - Command to check
 * @returns {boolean} True if command exists
 */
function commandExists(command) {
  const result = sh(
    process.platform === "win32" ? "where" : "which",
    [command],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  return result.success;
}

export { sh, node, npm, commandExists };
