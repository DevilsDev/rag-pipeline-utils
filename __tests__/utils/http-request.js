/**
 * Minimal HTTP client for tests: jest.setup.js blocks global fetch.
 * @returns {Promise<{status: number, headers: object, body: any}>}
 */
const http = require("http");

function httpRequest(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch {
          // non-JSON body
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

module.exports = { httpRequest };
