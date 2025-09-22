#!/usr/bin/env node

/**
 * @fileoverview SBOM (Software Bill of Materials) generation script
 * Generates SPDX-format SBOM for supply chain security and compliance
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const { logger } = require("../src/utils/logger");

/**
 * Generate SPDX SBOM for the current package
 */
async function generateSBOM() {
  try {
    logger.info("Generating SPDX SBOM...");

    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const lockExists = fs.existsSync("package-lock.json");

    if (!lockExists) {
      throw new Error("package-lock.json not found. Run npm install first.");
    }

    const timestamp = new Date().toISOString();
    const packageName = packageJson.name || "unknown";
    const version = packageJson.version || "0.0.0";
    const filename = `${packageName.replace(/[@\/]/g, "_")}-${version}.spdx`;

    // Calculate package hash
    const packageContent = fs.readFileSync("package.json", "utf8");
    const packageHash = crypto
      .createHash("sha256")
      .update(packageContent)
      .digest("hex");

    // Get license information
    const license = packageJson.license || "NOASSERTION";

    // Generate SPDX document
    const spdxDoc = {
      spdxVersion: "SPDX-2.3",
      dataLicense: "CC0-1.0",
      SPDXID: "SPDXRef-DOCUMENT",
      name: `${packageName}-${version} SBOM`,
      documentNamespace: `https://github.com/DevilsDev/rag-pipeline-utils/sbom/${crypto.randomUUID()}`,
      creationInfo: {
        created: timestamp,
        creators: ["Tool: rag-pipeline-utils-sbom-generator"],
        licenseListVersion: "3.19",
      },
      packages: [
        {
          SPDXID: "SPDXRef-Package",
          name: packageName,
          downloadLocation: packageJson.repository?.url || "NOASSERTION",
          filesAnalyzed: false,
          licenseConcluded: license,
          licenseDeclared: license,
          copyrightText: "NOASSERTION",
          versionInfo: version,
          supplier: `Person: ${packageJson.author || "NOASSERTION"}`,
          checksums: [
            {
              algorithm: "SHA256",
              checksumValue: packageHash,
            },
          ],
        },
      ],
      relationships: [
        {
          spdxElementId: "SPDXRef-DOCUMENT",
          relationshipType: "DESCRIBES",
          relatedSpdxElement: "SPDXRef-Package",
        },
      ],
    };

    // Add dependencies
    if (packageJson.dependencies) {
      let depIndex = 1;
      for (const [depName, depVersion] of Object.entries(
        packageJson.dependencies,
      )) {
        const depId = `SPDXRef-Dependency-${depIndex}`;

        spdxDoc.packages.push({
          SPDXID: depId,
          name: depName,
          downloadLocation: "NOASSERTION",
          filesAnalyzed: false,
          licenseConcluded: "NOASSERTION",
          licenseDeclared: "NOASSERTION",
          copyrightText: "NOASSERTION",
          versionInfo: depVersion,
          supplier: "NOASSERTION",
        });

        spdxDoc.relationships.push({
          spdxElementId: "SPDXRef-Package",
          relationshipType: "DEPENDS_ON",
          relatedSpdxElement: depId,
        });

        depIndex++;
      }
    }

    // Write SPDX file
    fs.writeFileSync(filename, JSON.stringify(spdxDoc, null, 2));

    logger.info(`SBOM generated successfully: ${filename}`);
    logger.info(`Total packages: ${spdxDoc.packages.length}`);
    logger.info(
      `Dependencies: ${Object.keys(packageJson.dependencies || {}).length}`,
    );

    // Validate SPDX format
    try {
      const validation = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (!validation.spdxVersion || !validation.packages) {
        throw new Error("Invalid SPDX format");
      }
      logger.info("SPDX validation passed");
    } catch (error) {
      logger.error("SPDX validation failed:", error.message);
      process.exit(1);
    }
  } catch (error) {
    logger.error("SBOM generation failed:", error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generateSBOM();
}

module.exports = { generateSBOM };
