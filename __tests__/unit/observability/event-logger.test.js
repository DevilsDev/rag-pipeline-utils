/**
 * Unit tests for structured event logging
 * Tests event logging, filtering, and export functionality
 */

const {
  PipelineEventLogger,
  EventTypes,
  EventSeverity,
  eventLogger,
} = require("../../../src/observability/event-logger.js");

describe("PipelineEventLogger", () => {
  let logger;

  beforeEach(() => {
    logger = new PipelineEventLogger({
      maxEventHistory: 100,
    });
  });

  describe("constructor", () => {
    it("should initialize with default options", () => {
      const defaultLogger = new PipelineEventLogger();
      expect(defaultLogger.enabled).toBe(true);
      expect(defaultLogger.maxEventHistory).toBe(1000);
      expect(defaultLogger.eventHistory).toEqual([]);
      expect(defaultLogger.sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
    });

    it("should respect custom options", () => {
      const customLogger = new PipelineEventLogger({
        enabled: false,
        includeStackTrace: true,
        maxEventHistory: 50,
      });

      expect(customLogger.enabled).toBe(false);
      expect(customLogger.includeStackTrace).toBe(true);
      expect(customLogger.maxEventHistory).toBe(50);
    });
  });

  describe("logEvent", () => {
    it("should log basic event", () => {
      logger.logEvent(
        EventTypes.PLUGIN_START,
        EventSeverity.INFO,
        { test: "data" },
        "Test message",
      );

      expect(logger.eventHistory).toHaveLength(1);
      const event = logger.eventHistory[0];

      expect(event.eventType).toBe(EventTypes.PLUGIN_START);
      expect(event.severity).toBe(EventSeverity.INFO);
      expect(event.message).toBe("Test message");
      expect(event.metadata.test).toBe("data");
      expect(event.sessionId).toBe(logger.sessionId);
      expect(event.timestamp).toBeDefined();
    });

    it("should not log when disabled", () => {
      logger.enabled = false;
      logger.logEvent(EventTypes.PLUGIN_START, EventSeverity.INFO, {}, "Test");

      expect(logger.eventHistory).toHaveLength(0);
    });

    it("should include stack trace for errors when enabled", () => {
      logger.includeStackTrace = true;
      logger.logEvent(
        EventTypes.PLUGIN_ERROR,
        EventSeverity.ERROR,
        {},
        "Error message",
      );

      const event = logger.eventHistory[0];
      expect(event.stackTrace).toBeDefined();
      expect(event.stackTrace).toContain("Error");
    });

    it("should maintain event history limit", () => {
      logger.maxEventHistory = 3;

      // Add 5 events
      for (let i = 0; i < 5; i++) {
        logger.logEvent(
          EventTypes.PLUGIN_START,
          EventSeverity.INFO,
          { index: i },
          `Message ${i}`,
        );
      }

      expect(logger.eventHistory).toHaveLength(3);
      expect(logger.eventHistory[0].metadata.index).toBe(2); // First two should be removed
      expect(logger.eventHistory[2].metadata.index).toBe(4);
    });
  });

  describe("plugin logging methods", () => {
    it("should log plugin start", () => {
      logger.logPluginStart("embedder", "openai", ["chunk1", "chunk2"], {
        batchSize: 2,
      });

      const event = logger.eventHistory[0];
      expect(event.eventType).toBe(EventTypes.PLUGIN_START);
      expect(event.metadata.pluginType).toBe("embedder");
      expect(event.metadata.pluginName).toBe("openai");
      expect(event.metadata.inputSize.type).toBe("array");
      expect(event.metadata.inputSize.length).toBe(2);
      expect(event.metadata.context.batchSize).toBe(2);
    });

    it("should log plugin end", () => {
      logger.logPluginEnd(
        "embedder",
        "openai",
        150,
        { vectorCount: 2 },
        { batchSize: 2 },
      );

      const event = logger.eventHistory[0];
      expect(event.eventType).toBe(EventTypes.PLUGIN_END);
      expect(event.metadata.pluginType).toBe("embedder");
      expect(event.metadata.duration).toBe(150);
      expect(event.metadata.status).toBe("success");
      expect(event.metadata.resultSize.vectorCount).toBe(2);
    });

    it("should log plugin error", () => {
      const error = new Error("Plugin failed");
      error.code = "PLUGIN_ERROR";

      logger.logPluginError("llm", "gpt-4", error, 500, { retryCount: 2 });

      const event = logger.eventHistory[0];
      expect(event.eventType).toBe(EventTypes.PLUGIN_ERROR);
      expect(event.severity).toBe(EventSeverity.ERROR);
      expect(event.metadata.pluginType).toBe("llm");
      expect(event.metadata.error.name).toBe("Error");
      expect(event.metadata.error.message).toBe("Plugin failed");
      expect(event.metadata.error.code).toBe("PLUGIN_ERROR");
      expect(event.metadata.duration).toBe(500);
    });
  });

  describe("stage logging methods", () => {
    it("should log stage start", () => {
      logger.logStageStart("ingest", { docPath: "test.pdf" });

      const event = logger.eventHistory[0];
      expect(event.eventType).toBe(EventTypes.STAGE_START);
      expect(event.metadata.stage).toBe("ingest");
      expect(event.metadata.docPath).toBe("test.pdf");
    });

    it("should log stage end", () => {
      logger.logStageEnd("query", 1200, {
        promptLength: 50,
        responseLength: 200,
      });

      const event = logger.eventHistory[0];
      expect(event.eventType).toBe(EventTypes.STAGE_END);
      expect(event.metadata.stage).toBe("query");
      expect(event.metadata.duration).toBe(1200);
      expect(event.metadata.status).toBe("success");
      expect(event.metadata.promptLength).toBe(50);
    });
  });

  describe("performance and memory logging", () => {
    it("should log performance metrics", () => {
      logger.logPerformanceMetric("embedding_duration", 150, "ms", {
        plugin: "openai",
      });

      const event = logger.eventHistory[0];
      expect(event.eventType).toBe(EventTypes.PERFORMANCE_METRIC);
      expect(event.metadata.metric).toBe("embedding_duration");
      expect(event.metadata.value).toBe(150);
      expect(event.metadata.unit).toBe("ms");
      expect(event.metadata.tags.plugin).toBe("openai");
    });

    it("should log memory warnings", () => {
      const memoryUsage = {
        heapUsed: 500 * 1024 * 1024, // 500MB
        heapTotal: 600 * 1024 * 1024,
        external: 50 * 1024 * 1024,
        rss: 700 * 1024 * 1024,
      };

      logger.logMemoryWarning(memoryUsage, 512); // 512MB threshold

      const event = logger.eventHistory[0];
      expect(event.eventType).toBe(EventTypes.MEMORY_WARNING);
      expect(event.severity).toBe(EventSeverity.WARN);
      expect(event.metadata.memoryUsage).toEqual(memoryUsage);
      expect(event.metadata.threshold).toBe(512);
      expect(event.metadata.usagePercentage).toBeCloseTo(97.65625, 1);
    });

    it("should log backpressure events", () => {
      const status = {
        bufferSize: 85,
        memory: { usagePercentage: 90 },
        isPaused: true,
      };

      logger.logBackpressure("applied", status);

      const event = logger.eventHistory[0];
      expect(event.eventType).toBe(EventTypes.BACKPRESSURE_APPLIED);
      expect(event.severity).toBe(EventSeverity.WARN);
      expect(event.metadata.action).toBe("applied");
      expect(event.metadata.bufferSize).toBe(85);
      expect(event.metadata.isPaused).toBe(true);
    });
  });

  describe("event listeners", () => {
    it("should add and notify event listeners", () => {
      const listener = jest.fn();
      logger.addEventListener(EventTypes.PLUGIN_START, listener);

      logger.logEvent(EventTypes.PLUGIN_START, EventSeverity.INFO, {}, "Test");

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: EventTypes.PLUGIN_START,
          message: "Test",
        }),
      );
    });

    it("should remove event listeners", () => {
      const listener = jest.fn();
      logger.addEventListener(EventTypes.PLUGIN_START, listener);
      logger.removeEventListener(EventTypes.PLUGIN_START, listener);

      logger.logEvent(EventTypes.PLUGIN_START, EventSeverity.INFO, {}, "Test");

      expect(listener).not.toHaveBeenCalled();
    });

    it("should handle listener errors gracefully", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      const faultyListener = jest.fn().mockImplementation(() => {
        throw new Error("Listener error");
      });

      logger.addEventListener(EventTypes.PLUGIN_START, faultyListener);
      logger.logEvent(EventTypes.PLUGIN_START, EventSeverity.INFO, {}, "Test");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Event listener error:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("event history and filtering", () => {
    beforeEach(() => {
      // Add sample events
      logger.logPluginStart("embedder", "openai", [], {});
      logger.logPluginEnd("embedder", "openai", 100, {}, {});
      logger.logPluginError("llm", "gpt-4", new Error("Test error"), 200, {});
      logger.logStageStart("query", {});
    });

    it("should get all event history", () => {
      const history = logger.getEventHistory();
      expect(history).toHaveLength(4);
    });

    it("should filter by event type", () => {
      const pluginEvents = logger.getEventHistory({
        eventType: EventTypes.PLUGIN_START,
      });
      expect(pluginEvents).toHaveLength(1);
      expect(pluginEvents[0].eventType).toBe(EventTypes.PLUGIN_START);
    });

    it("should filter by severity", () => {
      const errorEvents = logger.getEventHistory({
        severity: EventSeverity.ERROR,
      });
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].severity).toBe(EventSeverity.ERROR);
    });

    it("should filter by plugin type", () => {
      const embedderEvents = logger.getEventHistory({ pluginType: "embedder" });
      expect(embedderEvents).toHaveLength(2);
      embedderEvents.forEach((event) => {
        expect(event.metadata.pluginType).toBe("embedder");
      });
    });

    it("should filter by time range", () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60000);

      const recentEvents = logger.getEventHistory({
        since: oneMinuteAgo.toISOString(),
      });
      expect(recentEvents).toHaveLength(4); // All events should be recent

      const futureEvents = logger.getEventHistory({
        since: new Date(now.getTime() + 60000).toISOString(),
      });
      expect(futureEvents).toHaveLength(0);
    });

    it("should limit results", () => {
      const limitedEvents = logger.getEventHistory({ limit: 2 });
      expect(limitedEvents).toHaveLength(2);
      // Should return the last 2 events
      expect(limitedEvents[0].eventType).toBe(EventTypes.PLUGIN_ERROR);
      expect(limitedEvents[1].eventType).toBe(EventTypes.STAGE_START);
    });
  });

  describe("export and session management", () => {
    beforeEach(() => {
      logger.logPluginStart("embedder", "openai", [], {});
      logger.logPluginEnd("embedder", "openai", 100, {}, {});
    });

    it("should export events to JSON", () => {
      const exported = logger.exportEvents();
      const data = JSON.parse(exported);

      expect(data.sessionId).toBe(logger.sessionId);
      expect(data.exportTime).toBeDefined();
      expect(data.eventCount).toBe(2);
      expect(data.events).toHaveLength(2);
    });

    it("should export filtered events", () => {
      const exported = logger.exportEvents({
        eventType: EventTypes.PLUGIN_START,
      });
      const data = JSON.parse(exported);

      expect(data.eventCount).toBe(1);
      expect(data.events[0].eventType).toBe(EventTypes.PLUGIN_START);
    });

    it("should get session statistics", () => {
      const stats = logger.getSessionStats();

      expect(stats.sessionId).toBe(logger.sessionId);
      expect(stats.totalEvents).toBe(2);
      expect(stats.eventTypes[EventTypes.PLUGIN_START]).toBe(1);
      expect(stats.eventTypes[EventTypes.PLUGIN_END]).toBe(1);
      expect(stats.severityLevels[EventSeverity.DEBUG]).toBe(2);
      expect(stats.pluginTypes.embedder).toBe(2);
      expect(stats.sessionStartTime).toBeDefined();
      expect(stats.lastEventTime).toBeDefined();
    });

    it("should clear event history", () => {
      expect(logger.eventHistory).toHaveLength(2);
      logger.clearHistory();
      expect(logger.eventHistory).toHaveLength(0);
    });
  });

  describe("input/result size calculation", () => {
    it("should calculate array size", () => {
      const size = logger.getInputSize(["item1", "item2", "item3"]);
      expect(size).toEqual({ type: "array", length: 3 });
    });

    it("should calculate string size", () => {
      const size = logger.getInputSize("hello world");
      expect(size).toEqual({ type: "string", length: 11 });
    });

    it("should calculate object size", () => {
      const size = logger.getInputSize({ key1: "value1", key2: "value2" });
      expect(size).toEqual({ type: "object", keys: 2 });
    });

    it("should handle primitive types", () => {
      expect(logger.getInputSize(42)).toEqual({ type: "number" });
      expect(logger.getInputSize(true)).toEqual({ type: "boolean" });
      expect(logger.getInputSize(null)).toEqual({ type: "object" });
    });
  });
});

describe("global eventLogger", () => {
  it("should be a PipelineEventLogger instance", () => {
    expect(eventLogger).toBeInstanceOf(PipelineEventLogger);
  });

  it("should be enabled by default", () => {
    expect(eventLogger.enabled).toBe(true);
  });
});
