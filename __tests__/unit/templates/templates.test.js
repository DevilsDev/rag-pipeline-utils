"use strict";

const os = require("os");
const fs = require("fs");
const path = require("path");
const {
  TemplateRegistry,
} = require("../../../src/templates/template-registry");
const { ProjectScaffolder } = require("../../../src/templates/scaffold");

describe("TemplateRegistry", () => {
  let registry;

  beforeEach(() => {
    registry = new TemplateRegistry();
  });

  describe("list()", () => {
    test("returns 4 built-in templates", () => {
      const templates = registry.list();
      expect(templates.length).toBe(4);
    });

    test("each template has key, name, and description", () => {
      const templates = registry.list();
      for (const t of templates) {
        expect(t).toHaveProperty("key");
        expect(t).toHaveProperty("name");
        expect(t).toHaveProperty("description");
        expect(typeof t.key).toBe("string");
        expect(typeof t.name).toBe("string");
        expect(typeof t.description).toBe("string");
      }
    });

    test("includes expected template keys", () => {
      const templates = registry.list();
      const keys = templates.map((t) => t.key);
      expect(keys).toContain("document-qa");
      expect(keys).toContain("chatbot");
      expect(keys).toContain("code-search");
      expect(keys).toContain("customer-support");
    });
  });

  describe("get()", () => {
    test("returns template by key", () => {
      const template = registry.get("document-qa");
      expect(template).not.toBeNull();
      expect(template.name).toBe("Document Q&A");
      expect(template.files).toBeDefined();
      expect(template.dependencies).toBeDefined();
    });

    test("returns null for unknown key", () => {
      expect(registry.get("nonexistent")).toBeNull();
    });
  });

  describe("has()", () => {
    test("returns true for existing template", () => {
      expect(registry.has("chatbot")).toBe(true);
    });

    test("returns false for unknown template", () => {
      expect(registry.has("nonexistent")).toBe(false);
    });
  });

  describe("register()", () => {
    test("adds custom template", () => {
      registry.register("my-template", {
        name: "My Template",
        description: "A custom template",
        files: { "index.js": 'console.log("hello");' },
      });

      expect(registry.has("my-template")).toBe(true);
      const template = registry.get("my-template");
      expect(template.name).toBe("My Template");
    });

    test("registered template appears in list", () => {
      registry.register("custom", {
        name: "Custom",
        description: "Test",
        files: { "app.js": "" },
      });

      const templates = registry.list();
      expect(templates.length).toBe(5);
      const keys = templates.map((t) => t.key);
      expect(keys).toContain("custom");
    });

    test("throws for invalid key", () => {
      expect(() => registry.register("", { name: "X", files: {} })).toThrow(
        TypeError,
      );
      expect(() => registry.register(null, { name: "X", files: {} })).toThrow(
        TypeError,
      );
    });

    test("throws for template without name or files", () => {
      expect(() => registry.register("bad", {})).toThrow(TypeError);
      expect(() => registry.register("bad", { name: "X" })).toThrow(TypeError);
    });
  });
});

describe("ProjectScaffolder", () => {
  let scaffolder;
  let tmpDir;

  beforeEach(() => {
    scaffolder = new ProjectScaffolder();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffolder-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("create()", () => {
    test("creates directory and writes files", () => {
      const projectDir = path.join(tmpDir, "my-project");
      const result = scaffolder.create("document-qa", projectDir);

      expect(result.projectDir).toBe(path.resolve(projectDir));
      expect(result.template).toBe("document-qa");
      expect(Array.isArray(result.files)).toBe(true);
      expect(result.files).toContain("package.json");
      expect(result.files).toContain("index.js");

      // Verify files actually exist on disk
      expect(fs.existsSync(path.join(projectDir, "package.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "index.js"))).toBe(true);
    });

    test("creates valid package.json", () => {
      const projectDir = path.join(tmpDir, "pkg-test");
      scaffolder.create("chatbot", projectDir);

      const pkgJson = JSON.parse(
        fs.readFileSync(path.join(projectDir, "package.json"), "utf-8"),
      );
      expect(pkgJson.name).toBe("pkg-test");
      expect(pkgJson.version).toBe("1.0.0");
      expect(pkgJson.dependencies).toBeDefined();
    });

    test("creates .ragrc.json from template config", () => {
      const projectDir = path.join(tmpDir, "config-test");
      scaffolder.create("document-qa", projectDir);

      expect(fs.existsSync(path.join(projectDir, ".ragrc.json"))).toBe(true);
      const ragrc = JSON.parse(
        fs.readFileSync(path.join(projectDir, ".ragrc.json"), "utf-8"),
      );
      expect(ragrc.pipeline).toBeDefined();
    });

    test("emits created event", () => {
      const handler = jest.fn();
      scaffolder.on("created", handler);

      const projectDir = path.join(tmpDir, "event-test");
      scaffolder.create("chatbot", projectDir);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          projectDir: expect.any(String),
          files: expect.any(Array),
          template: "chatbot",
        }),
      );
    });
  });

  describe("with unknown template", () => {
    test("throws error", () => {
      const projectDir = path.join(tmpDir, "bad-template");
      expect(() =>
        scaffolder.create("nonexistent-template", projectDir),
      ).toThrow(/Unknown template/);
    });
  });

  describe("with existing directory", () => {
    test("throws error when overwrite is false", () => {
      const projectDir = path.join(tmpDir, "existing");
      fs.mkdirSync(projectDir);

      expect(() => scaffolder.create("chatbot", projectDir)).toThrow(
        /Directory already exists/,
      );
    });

    test("succeeds when overwrite option is true", () => {
      const projectDir = path.join(tmpDir, "overwrite-test");
      fs.mkdirSync(projectDir);

      const result = scaffolder.create("chatbot", projectDir, {
        overwrite: true,
      });
      expect(result.files).toContain("package.json");
    });
  });

  describe("listTemplates()", () => {
    test("returns template list", () => {
      const templates = scaffolder.listTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBe(4);
      expect(templates[0]).toHaveProperty("key");
      expect(templates[0]).toHaveProperty("name");
      expect(templates[0]).toHaveProperty("description");
    });
  });
});
