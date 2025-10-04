/**
 * Manual mock for octokit package
 * This allows tests to mock Octokit without hitting the network
 */

const mockCreateLabel = jest.fn();
const mockListLabelsForRepo = jest.fn();

class Octokit {
  constructor() {
    this.rest = {
      issues: {
        listLabelsForRepo: mockListLabelsForRepo,
        createLabel: mockCreateLabel,
      },
    };
  }
}

// Export mock functions for test access
Octokit.mockCreateLabel = mockCreateLabel;
Octokit.mockListLabelsForRepo = mockListLabelsForRepo;

module.exports = { Octokit };
