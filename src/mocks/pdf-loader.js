/**
 * Version: 0.1.0
 * File: /src/mocks/pdf-loader.js
 * Description: Mock implementation of a PDF document loader
 * Author: Ali Kahwaji
 */

 PDFLoader {
  /**
   * Loads a mock PDF file and returns an array of chunked content.
   * @param {string} filePath - Path to the PDF file
   * @returns {Promise<Array<{ chunk: () => string[] }>>}
   */
  async load(filePath) {
    return [{ chunk: () => [`Test loaded: ${filePath}`] }];
  }
}


// Default export
module.exports = {};


module.exports = class;