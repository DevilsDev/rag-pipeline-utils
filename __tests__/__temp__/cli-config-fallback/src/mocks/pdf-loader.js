/**
 * Mock PDF Loader Plugin
 * Implements: loader.load(filePath)
 */
export default class PdfLoader {
  /**
   * Loads a file and returns mock document chunks.
   * @param {string} filePath
   * @returns {Array<{ id: string, content: string }>}
   */
  load(filePath) {
    return [
      { id: "doc1", content: `Loaded content from ${filePath}` },
      { id: "doc2", content: "Second document content" },
    ];
  }
}
