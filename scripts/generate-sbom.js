#!/usr/bin/env node

/**
 * @fileoverview SPDX SBOM (Software Bill of Materials) Generator
 * Generates SPDX-compliant SBOM in JSON and XML formats for supply chain transparency
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

class SBOMGenerator {
  constructor() {
    this.packageJson = this.loadPackageJson();
    this.timestamp = new Date().toISOString();
    this.documentId = `SPDXRef-DOCUMENT-${crypto.randomUUID()}`;
    this.packageId = `SPDXRef-Package-${this.packageJson.name.replace(/[^a-zA-Z0-9]/g, "-")}`;
  }

  loadPackageJson() {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
      );
    } catch (error) {
      console.error("Error loading package.json:", error.message);
      process.exit(1);
    }
  }

  getDependencies() {
    try {
      // Get all installed dependencies with their versions
      const lockfile = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "package-lock.json"), "utf8"),
      );
      const dependencies = [];

      if (lockfile.packages) {
        Object.entries(lockfile.packages).forEach(
          ([packagePath, packageInfo]) => {
            if (packagePath && packagePath !== "" && packageInfo.version) {
              const name = packagePath.startsWith("node_modules/")
                ? packagePath.replace("node_modules/", "")
                : packagePath;

              if (name !== "" && !name.includes("/node_modules/")) {
                dependencies.push({
                  name: name,
                  version: packageInfo.version,
                  license: packageInfo.license || "NOASSERTION",
                  resolved: packageInfo.resolved || "",
                  integrity: packageInfo.integrity || "",
                  dev: packageInfo.dev === true,
                });
              }
            }
          },
        );
      }

      return dependencies;
    } catch (error) {
      console.warn(
        "Warning: Could not parse package-lock.json, falling back to package.json",
      );
      const deps = [];

      [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ].forEach((depType) => {
        if (this.packageJson[depType]) {
          Object.entries(this.packageJson[depType]).forEach(
            ([name, version]) => {
              deps.push({
                name,
                version: version.replace(/^[\^~]/, ""),
                license: "NOASSERTION",
                resolved: "",
                integrity: "",
                dev: depType === "devDependencies",
              });
            },
          );
        }
      });

      return deps;
    }
  }

  generateSHA256(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  generateSPDXJson() {
    const dependencies = this.getDependencies();

    const spdxDocument = {
      spdxVersion: "SPDX-2.3",
      dataLicense: "CC0-1.0",
      SPDXID: this.documentId,
      name: `${this.packageJson.name}-${this.packageJson.version}`,
      documentNamespace: `https://github.com/${this.packageJson.repository?.url?.split("/").slice(-2).join("/").replace(".git", "") || "unknown/unknown"}/${this.timestamp}`,
      creators: [
        "Tool: @devilsdev/rag-pipeline-utils-sbom-generator",
        `Person: ${this.packageJson.author || "Unknown"}`,
      ],
      created: this.timestamp,

      packages: [
        {
          SPDXID: this.packageId,
          name: this.packageJson.name,
          downloadLocation: this.packageJson.repository?.url || "NOASSERTION",
          filesAnalyzed: false,
          licenseConcluded: this.packageJson.license || "NOASSERTION",
          licenseDeclared: this.packageJson.license || "NOASSERTION",
          copyrightText: `Copyright (c) ${new Date().getFullYear()} ${this.packageJson.author || "Unknown"}`,
          versionInfo: this.packageJson.version,
          description: this.packageJson.description || "",
          homepage:
            this.packageJson.homepage || this.packageJson.repository?.url || "",
          supplier: `Person: ${this.packageJson.author || "Unknown"}`,
        },

        ...dependencies.map((dep, index) => ({
          SPDXID: `SPDXRef-Package-${dep.name.replace(/[^a-zA-Z0-9]/g, "-")}-${index}`,
          name: dep.name,
          downloadLocation: dep.resolved || "NOASSERTION",
          filesAnalyzed: false,
          licenseConcluded: dep.license,
          licenseDeclared: dep.license,
          copyrightText: "NOASSERTION",
          versionInfo: dep.version,
          supplier: "NOASSERTION",
          packageVerificationCode: dep.integrity
            ? {
                packageVerificationCodeValue:
                  dep.integrity.split("-")[1] || "NOASSERTION",
              }
            : undefined,
        })),
      ],

      relationships: [
        {
          spdxElementId: this.documentId,
          relationshipType: "DESCRIBES",
          relatedSpdxElement: this.packageId,
        },

        ...dependencies.map((dep, index) => ({
          spdxElementId: this.packageId,
          relationshipType: dep.dev ? "DEV_DEPENDENCY_OF" : "DEPENDS_ON",
          relatedSpdxElement: `SPDXRef-Package-${dep.name.replace(/[^a-zA-Z0-9]/g, "-")}-${index}`,
        })),
      ],
    };

    // Remove undefined values
    spdxDocument.packages = spdxDocument.packages.map((pkg) => {
      Object.keys(pkg).forEach((key) => {
        if (pkg[key] === undefined) {
          delete pkg[key];
        }
      });
      return pkg;
    });

    return spdxDocument;
  }

  generateSPDXXml(jsonDocument) {
    const escape = (str) =>
      str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<spdx:Document xmlns:spdx="http://spdx.org/spdxdocs/spdx-v2.3"
               xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               rdf:about="${escape(jsonDocument.documentNamespace)}">
  <spdx:spdxVersion>${escape(jsonDocument.spdxVersion)}</spdx:spdxVersion>
  <spdx:dataLicense>${escape(jsonDocument.dataLicense)}</spdx:dataLicense>
  <spdx:SPDXID>${escape(jsonDocument.SPDXID)}</spdx:SPDXID>
  <spdx:name>${escape(jsonDocument.name)}</spdx:name>
  <spdx:documentNamespace>${escape(jsonDocument.documentNamespace)}</spdx:documentNamespace>
  <spdx:created>${escape(jsonDocument.created)}</spdx:created>
`;

    jsonDocument.creators.forEach((creator) => {
      xml += `  <spdx:creator>${escape(creator)}</spdx:creator>\n`;
    });

    jsonDocument.packages.forEach((pkg) => {
      xml += `  <spdx:Package rdf:about="${escape(pkg.SPDXID)}">
    <spdx:SPDXID>${escape(pkg.SPDXID)}</spdx:SPDXID>
    <spdx:name>${escape(pkg.name)}</spdx:name>
    <spdx:downloadLocation>${escape(pkg.downloadLocation)}</spdx:downloadLocation>
    <spdx:filesAnalyzed>${pkg.filesAnalyzed}</spdx:filesAnalyzed>
    <spdx:licenseConcluded>${escape(pkg.licenseConcluded)}</spdx:licenseConcluded>
    <spdx:licenseDeclared>${escape(pkg.licenseDeclared)}</spdx:licenseDeclared>
    <spdx:copyrightText>${escape(pkg.copyrightText)}</spdx:copyrightText>
    <spdx:versionInfo>${escape(pkg.versionInfo)}</spdx:versionInfo>
`;
      if (pkg.description) {
        xml += `    <spdx:description>${escape(pkg.description)}</spdx:description>\n`;
      }
      if (pkg.homepage) {
        xml += `    <spdx:homepage>${escape(pkg.homepage)}</spdx:homepage>\n`;
      }
      if (pkg.supplier) {
        xml += `    <spdx:supplier>${escape(pkg.supplier)}</spdx:supplier>\n`;
      }
      xml += `  </spdx:Package>\n`;
    });

    jsonDocument.relationships.forEach((rel) => {
      xml += `  <spdx:Relationship>
    <spdx:spdxElementId>${escape(rel.spdxElementId)}</spdx:spdxElementId>
    <spdx:relationshipType>${escape(rel.relationshipType)}</spdx:relationshipType>
    <spdx:relatedSpdxElement>${escape(rel.relatedSpdxElement)}</spdx:relatedSpdxElement>
  </spdx:Relationship>\n`;
    });

    xml += "</spdx:Document>";
    return xml;
  }

  generate() {
    console.log("🔄 Generating SPDX SBOM...");

    try {
      const spdxJson = this.generateSPDXJson();
      const spdxXml = this.generateSPDXXml(spdxJson);

      // Write JSON format
      fs.writeFileSync("sbom.spdx.json", JSON.stringify(spdxJson, null, 2));
      console.log("✅ Generated SPDX SBOM in JSON format: sbom.spdx.json");

      // Write XML format
      fs.writeFileSync("sbom.spdx.xml", spdxXml);
      console.log("✅ Generated SPDX SBOM in XML format: sbom.spdx.xml");

      // Generate summary
      const dependencies = this.getDependencies();
      const summary = {
        package: this.packageJson.name,
        version: this.packageJson.version,
        totalDependencies: dependencies.length,
        productionDependencies: dependencies.filter((d) => !d.dev).length,
        devDependencies: dependencies.filter((d) => d.dev).length,
        licenses: [...new Set(dependencies.map((d) => d.license))].sort(),
        generated: this.timestamp,
      };

      fs.writeFileSync("sbom-summary.json", JSON.stringify(summary, null, 2));
      console.log("✅ Generated SBOM summary: sbom-summary.json");

      console.log(`\n📊 SBOM Summary:
  📦 Package: ${summary.package}@${summary.version}
  📋 Total Dependencies: ${summary.totalDependencies}
  🏭 Production: ${summary.productionDependencies}
  🔧 Development: ${summary.devDependencies}
  📜 Licenses: ${summary.licenses.length} unique (${summary.licenses.join(", ")})
`);

      return { spdxJson, spdxXml, summary };
    } catch (error) {
      console.error("❌ Error generating SBOM:", error.message);
      process.exit(1);
    }
  }
}

// CLI execution
if (require.main === module) {
  const generator = new SBOMGenerator();
  generator.generate();
}

module.exports = SBOMGenerator;
