module.exports = {
  branches: [
    "main",
    {
      name: "develop",
      prerelease: "beta",
    },
  ],
  plugins: [
    "@semantic-release/commit-analyzer",
    [
      "@semantic-release/release-notes-generator",
      {
        writerOpts: {
          committerDate: false,
        },
      },
    ],
    "@semantic-release/changelog",
    "@semantic-release/npm",
    "@semantic-release/github",
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
  ],
  preset: "conventionalcommits",
  releaseRules: [
    { type: "feat", release: "minor" },
    { type: "fix", release: "patch" },
    { type: "perf", release: "patch" },
    { type: "revert", release: "patch" },
    { type: "docs", release: false },
    { type: "style", release: false },
    { type: "chore", release: false },
    { type: "refactor", release: "patch" },
    { type: "test", release: false },
    { type: "build", release: false },
    { type: "ci", release: false },
    { breaking: true, release: "major" },
  ],
  parserOpts: {
    noteKeywords: ["BREAKING CHANGE", "BREAKING CHANGES"],
  },
};
