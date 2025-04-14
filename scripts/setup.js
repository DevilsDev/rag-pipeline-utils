import fs from "fs";
const fixturePath = "./__tests__/fixtures/sample.pdf";

if (!fs.existsSync(fixturePath)) {
  fs.mkdirSync("./__tests__/fixtures", { recursive: true });
  fs.writeFileSync(fixturePath, "Dummy PDF content for test");
}
