/**
 * Version: 1.0.0
 * Description: Mock OpenAI embedder plugin
 * Author: Test Fixture
 */

export default class MockEmbedder {
  async embed(docs) {
    return docs.map((_, i) => [i, i + 1, i + 2]);
  }
}

  