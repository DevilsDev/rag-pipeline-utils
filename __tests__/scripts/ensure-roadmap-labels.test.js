/**
 * Version: 2.1.2
 * Path: __tests__/scripts/ensure-roadmap-labels.test.js
 * Description: Unit tests for roadmap label creation using ESM-compatible Jest syntax.
 * Author: Ali Kahwaji
 */

import { jest } from '@jest/globals';

jest.unstable_mockModule('octokit', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      issues: {
        listLabelsForRepo: mockListLabelsForRepo,
        createLabel: mockCreateLabel
      }
    }
  }))
}));

// ✅ Shared mocks outside import context
const mockCreateLabel = jest.fn();
const mockListLabelsForRepo = jest.fn();

let ensureRoadmapLabels;
let roadmapLabels;

beforeAll(async () => {
  const imported = await import('../../scripts/ensure-roadmap-labels.js');
  ensureRoadmapLabels = imported.ensureRoadmapLabels;
  roadmapLabels = imported.roadmapLabels;
});

beforeEach(() => {
  mockCreateLabel.mockReset();
  mockListLabelsForRepo.mockReset();
});

describe('ensureRoadmapLabels', () => {
  it('creates all labels if none exist', async () => {
    mockListLabelsForRepo.mockResolvedValue({ data: [] });

    await ensureRoadmapLabels({ token: 'test-token', owner: 'ali', repo: 'rag-pipeline-utils' });

    expect(mockCreateLabel).toHaveBeenCalledTimes(roadmapLabels.length);
    for (const label of roadmapLabels) {
      expect(mockCreateLabel).toHaveBeenCalledWith({
        owner: 'ali',
        repo: 'rag-pipeline-utils',
        ...label
      });
    }
  });

  it('skips already existing labels', async () => {
    const existing = [{ name: 'priority: high' }, { name: 'group: docs' }];
    mockListLabelsForRepo.mockResolvedValue({ data: existing });

    await ensureRoadmapLabels({ token: 'test-token', owner: 'ali', repo: 'rag-pipeline-utils' });

    const expected = roadmapLabels.filter(l => !existing.some(e => e.name === l.name));
    expect(mockCreateLabel).toHaveBeenCalledTimes(expected.length);
  });
});
