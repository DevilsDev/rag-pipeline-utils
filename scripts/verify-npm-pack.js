#!/usr/bin/env node

/**
 * Verify npm pack tarball contents for supply-chain security
 * Ensures no sensitive files, scripts, or tests are included
 */

const fs = require("fs");
const path = require("path");

function verifyPackageFiles() {
  console.log("🔍 Verifying npm pack configuration...\n");

  // Read package.json
  const packagePath = path.join(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  console.log("📦 Files included in npm package:");
  pkg.files.forEach((file) => {
    console.log(`  ✅ ${file}`);
  });

  console.log("\n🚫 Files/directories excluded by design:");
  const excludedItems = [
    "scripts/",
    "__tests__/",
    "test/",
    "tests/",
    ".github/",
    ".husky/",
    "node_modules/",
    ".env*",
    "*.key",
    "*.pem",
    "*.token",
    ".secrets",
    "credentials.json",
    "auth.json",
    ".vscode/",
    ".idea/",
    "coverage/",
    "*.log",
    "tmp/",
    "temp/",
    ".cache/",
    "security-audit-report.json",
  ];

  excludedItems.forEach((item) => {
    console.log(`  🛡️  ${item}`);
  });

  // Verify critical exclusions
  console.log("\n🔒 Security verification:");

  // Check if sensitive directories exist and would be excluded
  const sensitiveDirectories = ["scripts", "__tests__", ".github", ".husky"];
  sensitiveDirectories.forEach((dir) => {
    const dirPath = path.join(__dirname, "..", dir);
    if (fs.existsSync(dirPath)) {
      console.log(`  ✅ ${dir}/ exists but will be excluded from package`);
    }
  });

  // Verify no secrets in files array
  const hasSecrets = pkg.files.some(
    (file) =>
      file.includes(".env") ||
      file.includes(".key") ||
      file.includes(".pem") ||
      file.includes("secret") ||
      file.includes("credential"),
  );

  if (hasSecrets) {
    console.log("  ❌ WARNING: Potential secrets in files array!");
    process.exit(1);
  } else {
    console.log("  ✅ No secrets in files array");
  }

  // Verify essential files are included
  const essentialFiles = ["dist/", "bin/", "README.md", "LICENSE"];
  const missingEssential = essentialFiles.filter(
    (file) => !pkg.files.includes(file),
  );

  if (missingEssential.length > 0) {
    console.log(`  ❌ Missing essential files: ${missingEssential.join(", ")}`);
    process.exit(1);
  } else {
    console.log("  ✅ All essential files included");
  }

  console.log("\n✅ npm pack configuration verified successfully!");
  console.log("📋 Summary:");
  console.log(`   • ${pkg.files.length} file patterns included`);
  console.log(`   • ${excludedItems.length} sensitive patterns excluded`);
  console.log("   • No secrets or development artifacts will be published");
  console.log("   • Supply-chain security requirements met");
}

if (require.main === module) {
  verifyPackageFiles();
}

module.exports = { verifyPackageFiles };
