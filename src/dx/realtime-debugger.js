/**
 * Real-time Debugger
 * 
 * Live pipeline inspection and debugging capabilities.
 * Provides real-time monitoring, breakpoints, and step-through debugging.
 */

const EventEmitter = require('events'); // eslint-disable-line global-require
const WebSocket = require('ws'); // eslint-disable-line global-require

class RealtimeDebugger extends EventEmitter {
  constructor(_options = {}) {
    super();
    
    this._options = {
      port: _options.port || 3002,
      enableBreakpoints: _options.enableBreakpoints !== false,
      enableStepThrough: _options.enableStepThrough !== false,
      enableVariableInspection: _options.enableVariableInspection !== false,
      maxHistorySize: _options.maxHistorySize || 1000,
      ..._options
    };
    
    this.sessions = new Map();
    this.breakpoints = new Map();
    this.executionHistory = [];
    this.currentExecution = null;
    this.isDebugging = false;
    this.wsServer = null;
    
    this.initializeDebugger();
  }
  
  /**
   * Initialize debugger components
   */
  initializeDebugger() {
    this.debuggerState = {
      status: 'idle',
      currentStep: null,
      variables: new Map(),
      callStack: [],
      performance: {
        startTime: null,
        stepTimes: [],
        totalTime: 0
      }
    };
  }
  
  /**
   * Start debugging session
   */
  startSession(sessionId, pipelineConfig) {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Debug session ${sessionId} already exists`);
    }
    
    const session = {
      id: sessionId,
      pipelineConfig,
      status: 'active',
      startTime: Date.now(),
      steps: [],
      variables: new Map(),
      breakpoints: new Set(),
      currentStep: null,
      isPaused: false
    };
    
    this.sessions.set(sessionId, session);
    this.emit('sessionStarted', { sessionId, session });
    
    return session;
  }
  
  /**
   * Add breakpoint
   */
  addBreakpoint(sessionId, componentId, condition = null) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }
    
    const breakpointId = `bp_${Date.now()}`;
    const breakpoint = {
      id: breakpointId,
      sessionId,
      componentId,
      condition,
      enabled: true,
      hitCount: 0,
      created: new Date().toISOString()
    };
    
    this.breakpoints.set(breakpointId, breakpoint);
    session.breakpoints.add(breakpointId);
    
    this.emit('breakpointAdded', { sessionId, breakpointId, breakpoint });
    this.broadcastToClients('breakpointAdded', { sessionId, breakpoint });
    
    return breakpointId;
  }
  
  /**
   * Remove breakpoint
   */
  removeBreakpoint(breakpointId) {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (!breakpoint) {
      throw new Error(`Breakpoint ${breakpointId} not found`);
    }
    
    const session = this.sessions.get(breakpoint.sessionId);
    if (session) {
      session.breakpoints.delete(breakpointId);
    }
    
    this.breakpoints.delete(breakpointId);
    
    this.emit('breakpointRemoved', { breakpointId, breakpoint });
    this.broadcastToClients('breakpointRemoved', { breakpointId });
  }
  
  /**
   * Execute pipeline step with debugging
   */
  async executeStep(sessionId, componentId, input, context = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }
    
    const stepId = `step_${Date.now()}`;
    const step = {
      id: stepId,
      componentId,
      input: this.cloneData(input),
      context: this.cloneData(context),
      startTime: Date.now(),
      endTime: null,
      output: null,
      error: null,
      variables: new Map(),
      performance: {
        duration: 0,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };
    
    session.steps.push(step);
    session.currentStep = stepId;
    
    this.emit('stepStarted', { sessionId, stepId, step });
    this.broadcastToClients('stepStarted', { sessionId, step: this.serializeStep(step) });
    
    // Check for breakpoints
    const shouldBreak = await this.checkBreakpoints(sessionId, componentId, input, context);
    if (shouldBreak) {
      session.isPaused = true;
      this.emit('breakpointHit', { sessionId, stepId, componentId });
      this.broadcastToClients('breakpointHit', { sessionId, stepId, componentId });
      
      // Wait for user to continue
      await this.waitForContinue(sessionId);
    }
    
    try {
      // Execute the actual component logic
      const output = await this.executeComponent(componentId, input, context, step);
      
      step.output = this.cloneData(output);
      step.endTime = Date.now();
      step.performance.duration = step.endTime - step.startTime;
      step.performance.cpuUsageEnd = process.cpuUsage(step.performance.cpuUsage);
      step.performance.memoryUsageEnd = process.memoryUsage();
      
      this.emit('stepCompleted', { sessionId, stepId, step });
      this.broadcastToClients('stepCompleted', { sessionId, step: this.serializeStep(step) });
      
      return output;
      
    } catch (error) {
      step.error = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
      step.endTime = Date.now();
      step.performance.duration = step.endTime - step.startTime;
      
      this.emit('stepError', { sessionId, stepId, step, error });
      this.broadcastToClients('stepError', { sessionId, step: this.serializeStep(step), error: step.error });
      
      throw error;
    }
  }
  
  /**
   * Execute component with debugging instrumentation
   */
  async executeComponent(componentId, input, context, step) {
    // This would integrate with the actual pipeline components
    // For now, we'll simulate component execution
    
    const startMemory = process.memoryUsage();
    const startCpu = process.cpuUsage();
    
    // Simulate component processing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
    
    // Capture variables and state
    step.variables.set('input_size', JSON.stringify(input).length);
    step.variables.set('context_keys', Object.keys(context));
    step.variables.set('component_id', componentId);
    step.variables.set('execution_time', Date.now() - step.startTime);
    
    // Simulate output based on component type
    let output;
    switch (componentId.split('_')[0]) {
      case 'loader':
        output = { documents: [{ id: '1', content: 'Sample document', metadata: {} }] };
        break;
      case 'embedder':
        output = { embeddings: [[0.1, 0.2, 0.3, 0.4, 0.5]] };
        break;
      case 'retriever':
        output = { results: [{ score: 0.95, document: { content: 'Relevant content' } }] };
        break;
      case 'llm':
        output = { response: 'Generated response based on retrieved context' };
        break;
      default:
        output = { processed: true, timestamp: Date.now() };
    }
    
    // Capture performance metrics
    const endMemory = process.memoryUsage();
    const endCpu = process.cpuUsage(startCpu);
    
    step.variables.set('memory_delta', endMemory.heapUsed - startMemory.heapUsed);
    step.variables.set('cpu_user_time', endCpu.user);
    step.variables.set('cpu_system_time', endCpu.system);
    
    return output;
  }
  
  /**
   * Check if breakpoints should trigger
   */
  async checkBreakpoints(sessionId, componentId, input, context) {
    const session = this.sessions.get(sessionId);
    if (!session || !this._options.enableBreakpoints) {
      return false;
    }
    
    for (const breakpointId of session.breakpoints) {
      const breakpoint = this.breakpoints.get(breakpointId);
      if (!breakpoint || !breakpoint.enabled) {
        continue;
      }
      
      if (breakpoint.componentId === componentId) {
        // Check condition if specified
        if (breakpoint.condition) {
          try {
            const conditionResult = await this.evaluateCondition(breakpoint.condition, input, context);
            if (!conditionResult) {
              continue;
            }
          } catch (error) {
            this.emit('conditionError', { breakpointId, error: error.message });
            continue;
          }
        }
        
        breakpoint.hitCount++;
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Evaluate breakpoint condition
   */
  async evaluateCondition(condition, input, context) {
    // Simple condition evaluation - in production, use a safe evaluator
    try {
      const func = new Function('input', 'context', `return ${condition}`);
      return func(input, context);
    } catch (error) {
      throw new Error(`Invalid condition: ${error.message}`);
    }
  }
  
  /**
   * Wait for user to continue execution
   */
  async waitForContinue(sessionId) {
    return new Promise((resolve) => {
      const continueHandler = (data) => {
        if (data.sessionId === sessionId && data.action === 'continue') {
          this.off('debugAction', continueHandler);
          resolve();
        }
      };
      
      this.on('debugAction', continueHandler);
    });
  }
  
  /**
   * Continue execution from breakpoint
   */
  continueExecution(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }
    
    session.isPaused = false;
    this.emit('debugAction', { sessionId, action: 'continue' });
    this.broadcastToClients('executionContinued', { sessionId });
  }
  
  /**
   * Step through execution (single step)
   */
  stepThrough(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }
    
    this.emit('debugAction', { sessionId, action: 'step' });
    this.broadcastToClients('stepThrough', { sessionId });
  }
  
  /**
   * Get variable values at current step
   */
  getVariables(sessionId, stepId = null) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }
    
    if (stepId) {
      const step = session.steps.find(s => s.id === stepId);
      if (!step) {
        throw new Error(`Step ${stepId} not found`);
      }
      return Object.fromEntries(step.variables);
    }
    
    // Return variables from current step
    const currentStep = session.steps[session.steps.length - 1];
    return currentStep ? Object.fromEntries(currentStep.variables) : {};
  }
  
  /**
   * Get call stack
   */
  getCallStack(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }
    
    return session.steps.map(step => ({
      stepId: step.id,
      componentId: step.componentId,
      startTime: step.startTime,
      duration: step.performance.duration,
      status: step.error ? 'error' : 'completed'
    }));
  }
  
  /**
   * Get execution timeline
   */
  getExecutionTimeline(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }
    
    return {
      sessionId,
      startTime: session.startTime,
      totalSteps: session.steps.length,
      totalDuration: session.steps.reduce((sum, step) => sum + (step.performance.duration || 0), 0),
      steps: session.steps.map(step => ({
        id: step.id,
        componentId: step.componentId,
        startTime: step.startTime,
        duration: step.performance.duration,
        status: step.error ? 'error' : 'completed',
        hasBreakpoint: Array.from(session.breakpoints).some(bpId => {
          const bp = this.breakpoints.get(bpId);
          return bp && bp.componentId === step.componentId;
        })
      }))
    };
  }
  
  /**
   * Start WebSocket server for real-time communication
   */
  startWebSocketServer() {
    if (this.wsServer) {
      throw new Error('WebSocket server is already running');
    }
    
    this.wsServer = new WebSocket.Server({ port: this._options.port });
    
    this.wsServer.on('connection', (ws) => {
      const clientId = `client_${Date.now()}`;
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(clientId, data, ws);
        } catch (error) {
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });
      
      ws.on('close', () => {
        this.emit('clientDisconnected', { clientId });
      });
      
      this.emit('clientConnected', { clientId });
      ws.send(JSON.stringify({ _type: 'connected', clientId }));
    });
    
    this.emit('webSocketServerStarted', { port: this._options.port });
  }
  
  /**
   * Handle client messages
   */
  handleClientMessage(clientId, data, ws) {
    switch (data._type) {
      case 'addBreakpoint':
        try {
          const breakpointId = this.addBreakpoint(data.sessionId, data.componentId, data.condition);
          ws.send(JSON.stringify({ _type: 'breakpointAdded', breakpointId }));
        } catch (error) {
          ws.send(JSON.stringify({ _type: 'error', message: error.message }));
        }
        break;
        
      case 'removeBreakpoint':
        try {
          this.removeBreakpoint(data.breakpointId);
          ws.send(JSON.stringify({ _type: 'breakpointRemoved', breakpointId: data.breakpointId }));
        } catch (error) {
          ws.send(JSON.stringify({ _type: 'error', message: error.message }));
        }
        break;
        
      case 'continue':
        try {
          this.continueExecution(data.sessionId);
          ws.send(JSON.stringify({ _type: 'continued', sessionId: data.sessionId }));
        } catch (error) {
          ws.send(JSON.stringify({ _type: 'error', message: error.message }));
        }
        break;
        
      case 'step':
        try {
          this.stepThrough(data.sessionId);
          ws.send(JSON.stringify({ _type: 'stepped', sessionId: data.sessionId }));
        } catch (error) {
          ws.send(JSON.stringify({ _type: 'error', message: error.message }));
        }
        break;
        
      case 'getVariables':
        try {
          const variables = this.getVariables(data.sessionId, data.stepId);
          ws.send(JSON.stringify({ _type: 'variables', sessionId: data.sessionId, variables }));
        } catch (error) {
          ws.send(JSON.stringify({ _type: 'error', message: error.message }));
        }
        break;
        
      default:
        ws.send(JSON.stringify({ _type: 'error', message: 'Unknown message _type' }));
    }
  }
  
  /**
   * Broadcast message to all connected clients
   */
  broadcastToClients(_type, data) {
    if (!this.wsServer) {
      return;
    }
    
    const message = JSON.stringify({ _type, ...data });
    this.wsServer.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
  
  /**
   * Serialize step for transmission
   */
  serializeStep(step) {
    return {
      id: step.id,
      componentId: step.componentId,
      startTime: step.startTime,
      endTime: step.endTime,
      duration: step.performance.duration,
      variables: Object.fromEntries(step.variables),
      error: step.error,
      hasOutput: !!step.output
    };
  }
  
  /**
   * Clone data for debugging (avoid mutations)
   */
  cloneData(data) {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (error) {
      return { _cloneError: 'Unable to clone data', _original: String(data) };
    }
  }
  
  /**
   * End debugging session
   */
  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session ${sessionId} not found`);
    }
    
    // Remove session breakpoints
    session.breakpoints.forEach(breakpointId => {
      this.breakpoints.delete(breakpointId);
    });
    
    this.sessions.delete(sessionId);
    
    this.emit('sessionEnded', { sessionId, session });
    this.broadcastToClients('sessionEnded', { sessionId });
  }
  
  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.sessions.values());
  }
  
  /**
   * Get debugger status
   */
  getStatus() {
    return {
      activeSessions: this.sessions.size,
      totalBreakpoints: this.breakpoints.size,
      isWebSocketServerRunning: !!this.wsServer,
      _options: this._options
    };
  }
  
  /**
   * Stop WebSocket server
   */
  stopWebSocketServer() {
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
      this.emit('webSocketServerStopped');
    }
  }
}

module.exports = RealtimeDebugger;
