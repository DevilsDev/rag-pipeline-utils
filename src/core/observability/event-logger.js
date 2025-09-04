"use strict";

const EventTypes = {
  PLUGIN_START: "plugin.start",
  PLUGIN_END: "plugin.end",
  PLUGIN_ERROR: "plugin.error",
  STAGE_START: "stage.start",
};

const EventSeverity = { DEBUG: "debug", INFO: "info", ERROR: "error" };

class PipelineEventLogger {
  constructor() {
    this._events = [];
    this._sessionId = null;
  }

  startSession() {
    this._sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return this._sessionId;
  }

  nowISO() {
    return new Date().toISOString();
  }

  getInputSize(v) {
    if (Array.isArray(v)) return { type: "array", length: v.length };
    if (typeof v === "string") return { type: "string", length: v.length };
    if (v === null) return { type: "object" }; // align with tests
    if (typeof v === "object")
      return { type: "object", keys: Object.keys(v).length };
    return { type: typeof v };
  }
  getResultSize(v) {
    return this.getInputSize(v);
  }

  logPluginStart({ pluginType, pluginName, input, context = {} }) {
    this._events.push({
      timestamp: this.nowISO(),
      severity: EventSeverity.DEBUG,
      sessionId: this._sessionId || this.startSession(),
      eventType: EventTypes.PLUGIN_START,
      message: `Starting ${pluginType} plugin: ${pluginName}`,
      metadata: {
        stage: "start",
        pluginType,
        pluginName,
        inputSize: this.getInputSize(input),
        context,
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
      },
    });
  }

  logPluginEnd({
    pluginType,
    pluginName,
    duration,
    result,
    status = "success",
    context = {},
  }) {
    const md = {
      stage: "end",
      pluginType,
      pluginName,
      duration,
      status,
      context,
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
    };
    if (Array.isArray(result?.vectors))
      md.resultSize = { vectorCount: result.vectors.length };
    else if (Array.isArray(result))
      md.resultSize = { vectorCount: result.length };

    this._events.push({
      timestamp: this.nowISO(),
      severity: EventSeverity.DEBUG,
      sessionId: this._sessionId || this.startSession(),
      eventType: EventTypes.PLUGIN_END,
      message: `Completed ${pluginType} plugin: ${pluginName} (${duration}ms)`,
      metadata: md,
    });
  }

  logPluginError({ pluginType, pluginName, duration, error, context = {} }) {
    this._events.push({
      timestamp: this.nowISO(),
      severity: EventSeverity.ERROR,
      sessionId: this._sessionId || this.startSession(),
      eventType: EventTypes.PLUGIN_ERROR,
      message: `Failed ${pluginType} plugin: ${pluginName} - ${error?.message}`,
      metadata: {
        stage: "error",
        pluginType,
        pluginName,
        duration,
        status: "error",
        error: error
          ? { name: error.name, message: error.message, code: error.code }
          : undefined,
        context,
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
      },
    });
  }

  logStageStart(stage) {
    this._events.push({
      timestamp: this.nowISO(),
      severity: EventSeverity.INFO,
      sessionId: this._sessionId || this.startSession(),
      eventType: EventTypes.STAGE_START,
      message: `Starting pipeline stage: ${stage}`,
      metadata: {
        stage,
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
      },
    });
  }

  logMemoryWarning({ memoryUsage, threshold = 512 }) {
    const usedBytes =
      typeof memoryUsage?.heapUsed === "number"
        ? memoryUsage.heapUsed
        : typeof memoryUsage?.rss === "number"
          ? memoryUsage.rss
          : 0;
    const usedMB = usedBytes / (1024 * 1024);
    const usagePercentage = +((usedMB / threshold) * 100).toFixed(2);

    this._events.push({
      timestamp: this.nowISO(),
      severity: EventSeverity.WARN || "warn",
      sessionId: this._sessionId || this.startSession(),
      eventType: "memory.warning",
      message: "High memory usage",
      metadata: { memoryUsage, threshold, usagePercentage },
    });
  }

  getEventHistory({
    eventType,
    severity,
    pluginType,
    since,
    until,
    limit,
  } = {}) {
    let list = [...this._events];

    if (since)
      list = list.filter((e) => new Date(e.timestamp) >= new Date(since));
    if (until)
      list = list.filter((e) => new Date(e.timestamp) <= new Date(until));
    if (eventType) list = list.filter((e) => e.eventType === eventType);
    if (severity) list = list.filter((e) => e.severity === severity);
    if (pluginType)
      list = list.filter(
        (e) =>
          e.metadata?.pluginType?.toLowerCase() ===
          String(pluginType).toLowerCase(),
      );

    list.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (typeof limit === "number") list = list.slice(-limit);

    return list;
  }

  exportEvents(filters) {
    const filtered = this.getEventHistory(filters);
    return JSON.stringify({
      sessionId: this._sessionId,
      eventCount: filtered.length,
      events: filtered,
    });
  }
}

module.exports = { PipelineEventLogger, EventTypes, EventSeverity };
