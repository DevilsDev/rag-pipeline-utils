/**
 * Version: 1.0.0
 * Path: __tests__/scripts/ensure-roadmap-labels.test.js
 * Description: Unit test for label creation helper using mocked Octokit
 * Author: Ali Kahwaji
 */

const { ensureRoadmapLabels, roadmapLabels } = require('../../../scripts/ensure-roadmap-labels');
const { Octokit } = require('octokit');

jest.mock('octokit');

describe('ensureRoadmapLabels', () => {
  const mockCreateLabel = jest.fn();
  const mockListLabelsForRepo = jest.fn();

  beforeEach(() => {
    Octokit.mockImplementation(() => ({
      rest: {
        issues: {
          listLabelsForRepo: mockListLabelsForRepo,
          createLabel: mockCreateLabel
        }
      }
    }));

    mockListLabelsForRepo.mockReset();
    mockCreateLabel.mockReset();
  });

  it('creates missing labels only', async () => {
    mockListLabelsForRepo.mockResolvedValue({ data: [{ name: 'priority: high' }] });

    await ensureRoadmapLabels({ token: 'test-token', owner: 'foo', repo: 'bar' });

    const expectedToCreate = roadmapLabels.filter((l) => l.name !== 'priority: high');
    expect(mockCreateLabel).toHaveBeenCalledTimes(expectedToCreate.length);
    expectedToCreate.forEach((label, idx) => {
      expect(mockCreateLabel).toHaveBeenNthCalledWith(idx + 1, { owner: 'foo', repo: 'bar', ...label });
    });
  });
});
