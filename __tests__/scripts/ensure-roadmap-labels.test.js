/**
 * Version: 2.1.2
 * Path: __tests__/scripts/ensure-roadmap-labels.test.js
 * Description: Unit tests for roadmap label creation using CommonJS Jest syntax.
 * Author: Ali Kahwaji
 */

// Mock octokit before requiring any modules
jest.mock("octokit");

// Now import mocked functions and module under test
const { Octokit } = require("octokit");
const {
  ensureRoadmapLabels,
  roadmapLabels,
} = require("../../scripts/ensure-roadmap-labels.js");

// Access mock functions from the manual mock
const mockCreateLabel = Octokit.mockCreateLabel;
const mockListLabelsForRepo = Octokit.mockListLabelsForRepo;

beforeEach(() => {
  mockCreateLabel.mockReset();
  mockListLabelsForRepo.mockReset();
});

describe("ensureRoadmapLabels", () => {
  it("creates all labels if none exist", async () => {
    mockListLabelsForRepo.mockResolvedValue({ data: [] });

    await ensureRoadmapLabels({
      token: "test-token",
      owner: "ali",
      repo: "rag-pipeline-utils",
    });

    expect(mockCreateLabel).toHaveBeenCalledTimes(roadmapLabels.length);
    for (const label of roadmapLabels) {
      expect(mockCreateLabel).toHaveBeenCalledWith({
        owner: "ali",
        repo: "rag-pipeline-utils",
        ...label,
      });
    }
  });

  it("skips already existing labels", async () => {
    const existing = [{ name: "priority: high" }, { name: "group: docs" }];
    mockListLabelsForRepo.mockResolvedValue({ data: existing });

    await ensureRoadmapLabels({
      token: "test-token",
      owner: "ali",
      repo: "rag-pipeline-utils",
    });

    const expected = roadmapLabels.filter(
      (l) => !existing.some((e) => e.name === l.name),
    );
    expect(mockCreateLabel).toHaveBeenCalledTimes(expected.length);
  });
});
