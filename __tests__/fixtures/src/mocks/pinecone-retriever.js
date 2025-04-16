/**
 * Version: 1.0.0
 * Description: Mock Pinecone retriever plugin
 * Author: Test Fixture
 */

export default class MockRetriever {
  async retrieve(query) {
    return [{ text: `Mock result for: ${query}` }];
  }
}


  