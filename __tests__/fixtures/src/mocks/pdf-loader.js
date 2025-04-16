/**
 * Version: 1.0.5
 * Description: Mock PDF loader plugin for integration testing
 * Author: alika
 * Path: __tests__/fixtures/src/mocks/pdf-loader.js
 */

export default class MockPdfLoader {
  async load(path) {
    return [{ text: `Stub content from: ${path}` }];
  }
}
