"use strict";

const {
  PipelineEventLogger,
  EventTypes,
  EventSeverity,
} = require("../../../src/core/observability/event-logger.js");

describe("core PipelineEventLogger constants", () => {
  it("has an EventTypes and EventSeverity entry for every event it records", () => {
    const logger = new PipelineEventLogger();
    logger.logStageStart("retrieve");
    logger.logStageEnd("retrieve", 12);
    logger.logMemoryWarning({
      memoryUsage: {
        heapUsed: 900 * 1024 * 1024,
        heapTotal: 1024 * 1024 * 1024,
      },
      threshold: 512,
    });
    const events = logger.getEventHistory();
    const types = new Set(Object.values(EventTypes));
    const severities = new Set(Object.values(EventSeverity));
    for (const event of events) {
      expect(types.has(event.eventType)).toBe(true);
      expect(severities.has(event.severity)).toBe(true);
    }
    expect(events.map((e) => e.eventType)).toEqual([
      EventTypes.STAGE_START,
      EventTypes.STAGE_END,
      EventTypes.MEMORY_WARNING,
    ]);
    expect(events[2].severity).toBe(EventSeverity.WARN);
  });
});
