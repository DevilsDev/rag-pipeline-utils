/**
 * Version: 0.1.0
 * Description: Semantic Release configuration for CI/CD automation with changelog, versioning, GitHub releases, and npm publishing.
 * Author: Ali Kahwaji
 */

const config = {
  branches: ["main"],
  repositoryUrl: "https://github.com/DevilsDev/rag-pipeline-utils",

  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
        changelogTitle: "# Changelog",
      },
    ],
    [
      "@semantic-release/npm",
      {
        npmPublish: true,
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "package-lock.json", "CHANGELOG.md"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};

module.exports = config;
module.exports.default = config;
