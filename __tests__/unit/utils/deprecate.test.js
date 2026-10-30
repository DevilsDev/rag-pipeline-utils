/**
 * Deprecation wrappers and the ./experimental entry split.
 */

const { deprecateClass } = require("../../../src/utils/deprecate");

describe("deprecateClass", () => {
  let warnings;
  let emitSpy;

  beforeEach(() => {
    warnings = [];
    emitSpy = jest
      .spyOn(process, "emitWarning")
      .mockImplementation((message, options) =>
        warnings.push({ message, code: options.code }),
      );
  });

  afterEach(() => emitSpy.mockRestore());

  function makeClass(name) {
    class Base {
      static create() {
        return new this();
      }

      hello() {
        return "hi";
      }
    }
    Object.defineProperty(Base, "name", { value: name });
    return Base;
  }

  test("warns once per class on construction, keeping behaviour", () => {
    const Original = makeClass("WidgetOne");
    const Wrapped = deprecateClass(Original, {
      name: "WidgetOne",
      message: "m",
    });

    const a = new Wrapped();
    new Wrapped();

    expect(a.hello()).toBe("hi");
    expect(warnings).toEqual([{ message: "m", code: "RAG_DEP_WIDGET_ONE" }]);
  });

  test("instanceof holds in both directions and the name is kept", () => {
    const Original = makeClass("WidgetTwo");
    const Wrapped = deprecateClass(Original, {
      name: "WidgetTwo",
      message: "m",
    });

    expect(new Wrapped()).toBeInstanceOf(Original);
    expect(new Original()).toBeInstanceOf(Wrapped);
    expect(Wrapped.name).toBe("WidgetTwo");
  });

  test("subclasses of the wrapper work and instanceof checks do not warn", () => {
    const Original = makeClass("WidgetThree");
    const Wrapped = deprecateClass(Original, {
      name: "WidgetThree",
      message: "m",
    });
    class Child extends Wrapped {}

    const plain = new Original();
    expect(plain instanceof Wrapped).toBe(true);
    expect(warnings).toHaveLength(0);

    expect(new Child().hello()).toBe("hi");
    expect(warnings).toHaveLength(1);
  });

  test("own static methods warn and still work", () => {
    const Original = makeClass("WidgetFour");
    const Wrapped = deprecateClass(Original, {
      name: "WidgetFour",
      message: "m",
    });

    expect(Wrapped.create()).toBeInstanceOf(Original);
    expect(warnings).toHaveLength(1);
  });

  test("the same class always gets the same wrapper", () => {
    const Original = makeClass("WidgetFive");
    const first = deprecateClass(Original, {
      name: "WidgetFive",
      message: "m",
    });
    expect(deprecateClass(Original, { name: "Alias", message: "x" })).toBe(
      first,
    );
  });

  test("acronyms produce readable warning codes", () => {
    deprecateClass(makeClass("SSOManager"), {
      name: "SSOManager",
      message: "m",
    });
    const Wrapped = deprecateClass(makeClass("OAuth2Provider"), {
      name: "OAuth2Provider",
      message: "m",
    });
    new Wrapped();
    expect(warnings[0].code).toBe("RAG_DEP_O_AUTH2_PROVIDER");
  });
});

describe("experimental entry", () => {
  // required in each test: the jest config resets the module registry per test
  test("the main entry no longer exports the experimental classes (3.0.0)", () => {
    const experimental = require("../../../src/experimental");
    const main = require("../../../src/index");
    const names = Object.keys(experimental);
    expect(names).toEqual(
      expect.arrayContaining(["SSOManager", "TenantManager", "PluginSandbox"]),
    );
    for (const name of names) {
      expect(main).not.toHaveProperty(name);
    }
  });

  test("stable exports are not wrapped", () => {
    const main = require("../../../src/index");
    const { AuditLogger } = require("../../../src/enterprise/audit-logging");
    const { PluginHub } = require("../../../src/ecosystem/plugin-hub");
    expect(main.AuditLogger).toBe(AuditLogger);
    expect(main.PluginHub).toBe(PluginHub);
  });

  test("the experimental entry is reachable from the main module for the build", () => {
    const main = require("../../../src/index");
    const experimental = require("../../../src/experimental");
    expect(main[Symbol.for("@devilsdev/rag-pipeline-utils/experimental")]).toBe(
      experimental,
    );
    expect(Object.keys(main)).not.toContain(
      "@devilsdev/rag-pipeline-utils/experimental",
    );
  });
});
