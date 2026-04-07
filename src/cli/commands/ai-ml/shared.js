/**
 * Shared utilities for AI/ML CLI commands
 */

const chalk = require("chalk");
const _path = require("path");

/**
 * Colorize status text based on status value
 * @param {string} status - Status string to colorize
 * @returns {string} Chalk-colorized status string
 */
function colorizeStatus(status) {
  switch (status) {
    case "completed":
    case "ready":
    case "active":
      return chalk.green(status);
    case "failed":
    case "error":
      return chalk.red(status);
    case "running":
    case "training":
      return chalk.yellow(status);
    default:
      return chalk.gray(status);
  }
}

/**
 * Detect content type from file extension
 * @param {string} filePath - Path to the file
 * @returns {string} MIME type string
 */
function detectContentType(filePath) {
  const ext = _path.extname(filePath).toLowerCase();

  if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
    return "image/jpeg";
  } else if ([".mp3", ".wav", ".flac", ".ogg"].includes(ext)) {
    return "audio/mpeg";
  } else if ([".mp4", ".avi", ".mov", ".webm"].includes(ext)) {
    return "video/mp4";
  } else if ([".txt", ".md", ".json"].includes(ext)) {
    return "text/plain";
  }

  return "application/octet-stream";
}

module.exports = { colorizeStatus, detectContentType };
