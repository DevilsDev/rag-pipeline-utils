'use strict';

/**
 * Event type names used by PipelineEventLogger. The logger also emits
 * 'stage.end' and 'memory.warning', which have no entry here.
 * @type {{PLUGIN_START: string, PLUGIN_END: string, PLUGIN_ERROR: string, STAGE_START: string, STAGE_ERROR: string}}
 */
const EventTypes = {
  /** A plugin call started. */
  PLUGIN_START: 'plugin.start',
  /** A plugin call finished. */
  PLUGIN_END: 'plugin.end',
  /** A plugin call failed. */
  PLUGIN_ERROR: 'plugin.error',
  /** A pipeline stage started. */
  STAGE_START: 'stage.start',
  /** A pipeline stage failed. Not emitted by PipelineEventLogger itself. */
  STAGE_ERROR: 'stage.error',
};

/**
 * Severity levels used by PipelineEventLogger. Memory warnings use 'warn',
 * which has no entry here.
 * @type {{DEBUG: string, INFO: string, ERROR: string}}
 */
const EventSeverity = {
  /** Plugin start and end events. */
  DEBUG: 'debug',
  /** Stage events. */
  INFO: 'info',
  /** Plugin errors. */
  ERROR: 'error',
};

/**
 * In-memory log of pipeline events (plugin and stage lifecycle, memory
 * warnings, custom events) tagged with a session id. A session is started
 * on the first event if startSession was not called.
 */
class PipelineEventLogger {
  constructor() {
    this._events = [];
    this._sessionId = null;
  }

  /**
   * Start a new session with a fresh id and start time. Existing events are kept.
   * @returns {string} The new session id
   */
  startSession() {
    this._sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this._sessionStartTime = new Date().toISOString();
    return this._sessionId;
  }

  /**
   * Current time as an ISO 8601 string.
   * @returns {string}
   */
  nowISO() {
    return new Date().toISOString();
  }

  /**
   * Describe a value's size: length for arrays and strings, key count for
   * objects, type only for null and primitives.
   * @param {*} v - Value to describe
   * @returns {{type: string, length?: number, keys?: number}}
   */
  getInputSize(v) {
    if (Array.isArray(v)) return { type: 'array', length: v.length };
    if (typeof v === 'string') return { type: 'string', length: v.length };
    if (v === null) return { type: 'object' }; // align with tests
    if (typeof v === 'object')
      return { type: 'object', keys: Object.keys(v).length };
    return { type: typeof v };
  }
  /**
   * Same as getInputSize.
   * @param {*} v - Value to describe
   * @returns {{type: string, length?: number, keys?: number}}
   */
  getResultSize(v) {
    return this.getInputSize(v);
  }

  /**
   * Record a debug-level plugin.start event with the input size and process info.
   * @param {Object} event
   * @param {string} event.pluginType - Plugin type, such as embedder or retriever
   * @param {string} event.pluginName - Plugin name
   * @param {*} [event.input] - Plugin input; only its size is recorded
   * @param {Object<string, *>} [event.context={}] - Extra metadata
   * @returns {void}
   */
  logPluginStart({ pluginType, pluginName, input, context = {} }) {
    this._events.push({
      timestamp: this.nowISO(),
      severity: EventSeverity.DEBUG,
      sessionId: this._sessionId || this.startSession(),
      eventType: EventTypes.PLUGIN_START,
      message: `Starting ${pluginType} plugin: ${pluginName}`,
      metadata: {
        stage: 'start',
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

  /**
   * Record a debug-level plugin.end event. When the result is an array, or
   * has a vectors array, its length is recorded as resultSize.vectorCount.
   * @param {Object} event
   * @param {string} event.pluginType - Plugin type
   * @param {string} event.pluginName - Plugin name
   * @param {number} [event.duration] - Duration in milliseconds
   * @param {*} [event.result] - Plugin result; only its length is recorded
   * @param {string} [event.status='success'] - Outcome
   * @param {Object<string, *>} [event.context={}] - Extra metadata
   * @returns {void}
   */
  logPluginEnd({
    pluginType,
    pluginName,
    duration,
    result,
    status = 'success',
    context = {},
  }) {
    const md = {
      stage: 'end',
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

  /**
   * Record an error-level plugin.error event with the error's name, message and code.
   * @param {Object} event
   * @param {string} event.pluginType - Plugin type
   * @param {string} event.pluginName - Plugin name
   * @param {number} [event.duration] - Duration in milliseconds
   * @param {Error & {code?: string}} [event.error] - The error thrown
   * @param {Object<string, *>} [event.context={}] - Extra metadata
   * @returns {void}
   */
  logPluginError({ pluginType, pluginName, duration, error, context = {} }) {
    this._events.push({
      timestamp: this.nowISO(),
      severity: EventSeverity.ERROR,
      sessionId: this._sessionId || this.startSession(),
      eventType: EventTypes.PLUGIN_ERROR,
      message: `Failed ${pluginType} plugin: ${pluginName} - ${error?.message}`,
      metadata: {
        stage: 'error',
        pluginType,
        pluginName,
        duration,
        status: 'error',
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

  /**
   * Record an info-level stage.start event.
   * @param {string} stage - Stage name
   * @returns {void}
   */
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

  /**
   * Record a warn-level memory.warning event. usagePercentage is heapUsed
   * (or rss if heapUsed is missing) in MB as a percentage of threshold.
   * @param {Object} event
   * @param {{heapUsed?: number, rss?: number}} event.memoryUsage - Memory figures in bytes, as from process.memoryUsage()
   * @param {number} [event.threshold=512] - Threshold in MB
   * @returns {void}
   */
  logMemoryWarning({ memoryUsage, threshold = 512 }) {
    const usedBytes =
      typeof memoryUsage?.heapUsed === 'number'
        ? memoryUsage.heapUsed
        : typeof memoryUsage?.rss === 'number'
          ? memoryUsage.rss
          : 0;
    const usedMB = usedBytes / (1024 * 1024);
    const usagePercentage = +((usedMB / threshold) * 100).toFixed(2);

    this._events.push({
      timestamp: this.nowISO(),
      severity: EventSeverity.WARN || 'warn',
      sessionId: this._sessionId || this.startSession(),
      eventType: 'memory.warning',
      message: 'High memory usage',
      metadata: { memoryUsage, threshold, usagePercentage },
    });
  }

  /**
   * Recorded events, oldest first, optionally filtered.
   * @param {Object} [filters]
   * @param {string} [filters.eventType]
   * @param {string} [filters.severity]
   * @param {string} [filters.pluginType]
   * @param {string|number|Date} [filters.since] - Only events at or after this time
   * @param {string|number|Date} [filters.until] - Only events at or before this time
   * @param {number} [filters.limit] - Keep only the most recent `limit` events
   * @returns {Object[]}
   */
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
    if (typeof limit === 'number') list = list.slice(-limit);

    return list;
  }

  /**
   * Serialize the session id and the events matching the filters.
   * @param {Object} [filters] - Same filters as getEventHistory
   * @returns {string} JSON string with sessionId, eventCount and events
   */
  exportEvents(filters) {
    const filtered = this.getEventHistory(filters);
    return JSON.stringify({
      sessionId: this._sessionId,
      eventCount: filtered.length,
      events: filtered,
    });
  }

  /**
   * Record an event of any type.
   * @param {string} eventType - Event type
   * @param {string} severity - Severity level
   * @param {Object<string, *>} [metadata={}] - Event metadata
   * @param {string} [message] - Message; defaults to 'Event: ' plus the event type
   * @returns {this}
   */
  logEvent(eventType, severity, metadata = {}, message) {
    this._events.push({
      timestamp: this.nowISO(),
      eventType,
      sessionId: this._sessionId || this.startSession(),
      severity,
      message: message || `Event: ${eventType}`,
      metadata,
    });
    return this;
  }

  /**
   * Remove all recorded events. The session id is kept.
   * @returns {this}
   */
  clearHistory() {
    this._events = [];
    return this;
  }

  /**
   * Record an info-level stage.end event.
   * @param {string} stage - Stage name
   * @param {number} duration - Duration in milliseconds
   * @param {Object<string, *>} [metadata={}] - Extra metadata merged into the event metadata
   * @returns {this}
   */
  logStageEnd(stage, duration, metadata = {}) {
    this._events.push({
      timestamp: this.nowISO(),
      eventType: 'stage.end',
      sessionId: this._sessionId || this.startSession(),
      severity: 'info',
      message: `Stage ${stage} completed in ${duration}ms`,
      metadata: {
        stage,
        duration,
        type: 'stage_lifecycle',
        ...metadata,
      },
    });
    return this;
  }

  /**
   * Current session id. Starts a session if none is active.
   * @returns {string}
   */
  get sessionId() {
    return this._sessionId || this.startSession();
  }

  /**
   * Session id, total event count, session start time and the distinct event
   * types recorded. Starts a session if none is active.
   * @returns {{sessionId: string, totalEvents: number, startTime: string, eventTypes: string[]}}
   */
  getSessionStats() {
    return {
      sessionId: this.sessionId,
      totalEvents: this._events.length,
      startTime: this._sessionStartTime || new Date().toISOString(),
      eventTypes: [...new Set(this._events.map((e) => e.eventType))],
    };
  }
}

module.exports = { PipelineEventLogger, EventTypes, EventSeverity };
