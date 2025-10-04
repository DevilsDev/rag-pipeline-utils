/**
 * Interactive Wizard Tests
 * Tests for interactive CLI wizard functionality
 */

const { InteractiveWizard } = require("../../../src/cli/interactive-wizard.js");

describe("Interactive Wizard", () => {
  let wizard;

  beforeEach(() => {
    wizard = new InteractiveWizard();
    jest.clearAllMocks();
  });

  describe("wizard initialization", () => {
    it("should initialize wizard with default settings", () => {
      expect(wizard).toBeDefined();
      expect(wizard.steps).toBeDefined();
    });

    it("should load wizard configuration", () => {
      const config = wizard.loadConfig();
      expect(config).toBeDefined();
      expect(typeof config).toBe("object");
    });
  });

  describe("step navigation", () => {
    it("should navigate to next step", () => {
      const nextStep = wizard.nextStep();
      expect(nextStep).toBeDefined();
    });

    it("should navigate to previous step", () => {
      const prevStep = wizard.previousStep();
      expect(prevStep).toBeDefined();
    });

    it("should complete wizard successfully", async () => {
      const result = await wizard.complete();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe("user input handling", () => {
    it("should validate user input", () => {
      const isValid = wizard.validateInput("test-input");
      expect(typeof isValid).toBe("boolean");
    });

    it("should process user selections", () => {
      const processed = wizard.processSelection("option1");
      expect(processed).toBeDefined();
    });
  });
});
