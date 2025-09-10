/**
 * Community Plugin Hub
 * Public registry with ratings, reviews, downloads, and discovery
 */

const fs = require('fs').promises; // eslint-disable-line global-require
const path = require('path'); // eslint-disable-line global-require
const crypto = require('crypto'); // eslint-disable-line global-require
const { EventEmitter } = require('events'); // eslint-disable-line global-require

function pickFetch(pref) {
  // Prefer a provided fetch if it is a function; otherwise fall back to globalThis.fetch if available.
  if (typeof pref === 'function') return pref;
  if (typeof globalThis.fetch === 'function') return globalThis.fetch;
  return null;
}

async function parseJsonSafe(res) {
  // Handle both mocked and real fetch responses:
  // some tests use only res.json(); others only res.text(); accommodate both.
  if (res && typeof res.json === 'function') {
    try {
      return await res.json();
    } catch (_) {
      /* fall back */
    }
  }
  if (res && typeof res.text === 'function') {
    const t = await res.text();
    if (!t) return {};
    try {
      return JSON.parse(t);
    } catch (_) {
      return { raw: t };
    }
  }
  // If tests returned a plain object (already "parsed"):
  if (res && typeof res === 'object' && !('ok' in res)) {
    return res;
  }
  return {};
}

class PluginHub extends EventEmitter {
  constructor(_options = {}) {
    super();

    this._config = {
      registryUrl: _options.registryUrl || 'https://registry.rag-pipeline.dev',
      localCacheDir:
        _options.localCacheDir || path.join(process.cwd(), '.rag-cache'),
      apiKey: _options.apiKey || process.env.RAG_PLUGIN_HUB_API_KEY,
      userAgent: _options.userAgent || 'rag-pipeline-utils/2.1.8',
      timeout: _options.timeout || 30000,
      maxRetries: _options.maxRetries || 3,
      fetch: _options.fetch, // optional injected fetch for tests
      ..._options,
    };

    this._fetch = pickFetch(this._config.fetch);
    this.cache = new Map();
    this.analytics = new PluginAnalytics(this._config);
    this.sandbox = new PluginSandbox(this._config);
  }

  /**
   * Search plugins in the community hub
   */
  async searchPlugins(query, _options = {}) {
    const searchParams = {
      q: query,
      category: _options.category,
      tags: _options.tags,
      author: _options.author,
      minRating: _options.minRating || 0,
      verified: _options.verified,
      limit: _options.limit || 20,
      offset: _options.offset || 0,
      sortBy: _options.sortBy || 'relevance', // relevance, downloads, rating, updated
    };

    try {
      const response = await this._makeRequest(
        'GET',
        '/plugins/search',
        searchParams,
      );

      // Track search analytics
      this.analytics.trackSearch(
        query,
        Array.isArray(response.results) ? response.results.length : 0,
      );

      return {
        results: (response.results || []).map((plugin) =>
          this._normalizePluginInfo(plugin),
        ),
        total: response.total ?? 0,
        hasMore: response.hasMore ?? false,
        facets: response.facets || {},
      };
    } catch (error) {
      this.emit('error', { type: 'search_failed', query, error });
      throw new Error(`Plugin search failed: ${error.message}`);
    }
  }

  /**
   * Get detailed plugin information
   */
  async getPluginInfo(pluginId) {
    const cacheKey = `plugin:${pluginId}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) {
        // 5 minutes
        return cached.data;
      }
    }

    try {
      const response = await this._makeRequest('GET', `/plugins/${pluginId}`);
      const pluginInfo = this._normalizePluginInfo(response);

      // Cache the result
      this.cache.set(cacheKey, {
        data: pluginInfo,
        timestamp: Date.now(),
      });

      // Track view analytics
      this.analytics.trackPluginView(pluginId);

      return pluginInfo;
    } catch (error) {
      this.emit('error', { type: 'plugin_info_failed', pluginId, error });
      throw new Error(`Failed to get plugin info: ${error.message}`);
    }
  }

  /**
   * Install plugin from the hub
   */
  async installPlugin(pluginId, version = 'latest', _options = {}) {
    const installId = crypto.randomUUID();
    const startedAt = Date.now();

    try {
      this.emit('install_start', { pluginId, version, installId });

      // Get plugin info and verify
      const pluginInfo = await this.getPluginInfo(pluginId);
      if (!pluginInfo) throw new Error(`Plugin ${pluginId} not found`);

      // Check certification if required
      if (_options.requireCertified && !pluginInfo.certified) {
        throw new Error(`Plugin ${pluginId} is not certified`);
      }

      // Security scan in sandbox
      if (_options.securityScan !== false) {
        this.emit('install_progress', { installId, stage: 'security_scan' });
        await this.sandbox.scanPlugin(pluginInfo);
      }

      // Download plugin
      this.emit('install_progress', { installId, stage: 'downloading' });
      const downloadUrl = await this._getDownloadUrl(pluginId, version);
      const pluginData = await this._downloadPlugin(downloadUrl);

      // Verify integrity
      this.emit('install_progress', { installId, stage: 'verifying' });
      await this._verifyPluginIntegrity(pluginData, pluginInfo.checksums);

      // Install in sandbox first
      this.emit('install_progress', { installId, stage: 'sandbox_install' });
      const sandboxResult = await this.sandbox.installPlugin(pluginData, {
        timeout: _options.sandboxTimeout || 30000,
        memoryLimit: _options.memoryLimit || '512MB',
        networkAccess: _options.networkAccess || false,
      });

      if (!sandboxResult.success) {
        throw new Error(`Sandbox installation failed: ${sandboxResult.error}`);
      }

      // Install to main system
      this.emit('install_progress', { installId, stage: 'installing' });
      const installPath = await this._installPluginToSystem(
        pluginData,
        pluginInfo,
      );

      // Track installation analytics
      this.analytics.trackInstallation(pluginId, version, {
        success: true,
        installTime: Date.now() - startedAt,
      });

      this.emit('install_complete', {
        pluginId,
        version,
        installId,
        installPath,
        pluginInfo,
      });

      return {
        success: true,
        pluginId,
        version,
        installPath,
        pluginInfo,
      };
    } catch (error) {
      this.analytics.trackInstallation(pluginId, version, {
        success: false,
        error: error.message,
      });

      this.emit('install_error', { pluginId, version, installId, error });
      throw error;
    }
  }

  /**
   * Publish plugin to the hub
   */
  async publishPlugin(pluginPath, _options = {}) {
    const publishId = crypto.randomUUID();

    try {
      this.emit('publish_start', { pluginPath, publishId });

      // Validate plugin structure
      this.emit('publish_progress', { publishId, stage: 'validation' });
      const pluginInfo = await this._validatePluginForPublish(pluginPath);

      // Security scan
      this.emit('publish_progress', { publishId, stage: 'security_scan' });
      const securityReport = await this.sandbox.scanPlugin(pluginInfo);
      if (securityReport.risk === 'high') {
        throw new Error(
          `Plugin failed security scan: ${securityReport.issues.join(', ')}`,
        );
      }

      // Package plugin
      this.emit('publish_progress', { publishId, stage: 'packaging' });
      const packageData = await this._packagePlugin(pluginPath, pluginInfo);

      // Upload to registry
      this.emit('publish_progress', { publishId, stage: 'uploading' });
      const response = await this._uploadPlugin(packageData, {
        ..._options,
        securityReport,
      });

      this.emit('publish_complete', {
        publishId,
        pluginId: response.pluginId,
        version: response.version,
        url: response.url,
      });

      return response;
    } catch (error) {
      this.emit('publish_error', { pluginPath, publishId, error });
      throw error;
    }
  }

  /**
   * Rate and review a plugin
   */
  async ratePlugin(pluginId, rating, review = null) {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    try {
      const response = await this._makeRequest(
        'POST',
        `/plugins/${pluginId}/reviews`,
        {
          rating,
          review,
          version: await this._getInstalledVersion(pluginId),
        },
      );

      this.analytics.trackReview(pluginId, rating);
      return response;
    } catch (error) {
      this.emit('error', { type: 'review_failed', pluginId, error });
      throw new Error(`Failed to submit review: ${error.message}`);
    }
  }

  /**
   * Get plugin reviews and ratings
   */
  async getPluginReviews(pluginId, _options = {}) {
    try {
      const response = await this._makeRequest(
        'GET',
        `/plugins/${pluginId}/reviews`,
        {
          limit: _options.limit || 10,
          offset: _options.offset || 0,
          sortBy: _options.sortBy || 'helpful',
        },
      );

      return response;
    } catch (error) {
      throw new Error(`Failed to get reviews: ${error.message}`);
    }
  }

  /**
   * Get trending plugins
   */
  async getTrendingPlugins(_options = {}) {
    try {
      const response = await this._makeRequest('GET', '/plugins/trending', {
        period: _options.period || 'week', // day, week, month
        category: _options.category,
        limit: _options.limit || 20,
      });

      return (response.results || []).map((plugin) =>
        this._normalizePluginInfo(plugin),
      );
    } catch (error) {
      throw new Error(`Failed to get trending plugins: ${error.message}`);
    }
  }

  /**
   * Get user's installed plugins
   */
  async getInstalledPlugins() {
    try {
      const pluginsDir = path.join(this._config.localCacheDir, 'plugins');
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true });

      const installed = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metadataPath = path.join(
            pluginsDir,
            entry.name,
            'metadata.json',
          );

          try {
            const metadata = JSON.parse(
              await fs.readFile(metadataPath, 'utf8'),
            );
            installed.push({
              ...metadata,
              installPath: path.join(pluginsDir, entry.name),
              lastUsed: await this.analytics.getLastUsed(metadata.id),
            });
          } catch {
            // Skip invalid plugins
            continue; // eslint-disable-line no-continue
          }
        }
      }

      return installed;
    } catch {
      return [];
    }
  }

  // ------------------------------
  // Private methods
  // ------------------------------
  async _makeRequest(method, endpoint, params = {}) {
    const doFetch = pickFetch(this._config.fetch);
    if (!doFetch) throw new Error('fetch is not available in this environment');

    const url = new URL(endpoint, this._config.registryUrl);

    if (method === 'GET' && Object.keys(params).length > 0) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers = {
      'User-Agent': this._config.userAgent,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (this._config.apiKey)
      headers.Authorization = `Bearer ${this._config.apiKey}`;

    const options = { method, headers };

    if (method !== 'GET' && Object.keys(params).length > 0) {
      options.body = JSON.stringify(params);
    }

    let lastError;
    for (let attempt = 0; attempt < this._config.maxRetries; attempt++) {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = this._config.timeout || 0;
      let timeoutId = null;
      if (controller && t > 0) {
        timeoutId = setTimeout(() => controller.abort(), t);
        // In Node/Jest, this prevents timers from keeping the process alive
        if (typeof timeoutId?.unref === 'function') timeoutId.unref();
      }

      try {
        const res = await doFetch(url.toString(), {
          ...options,
          signal: controller ? controller.signal : undefined,
        });

        if (!res || !('ok' in res)) {
          throw new Error('Invalid fetch response');
        }

        if (!res.ok) {
          // Try to surface server message
          let msg = `HTTP ${res.status}: ${res.statusText}`;
          try {
            const errData = await parseJsonSafe(res);
            if (errData && errData.message) msg = errData.message;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }

        // Success path: parse JSON flexibly
        const data = await parseJsonSafe(res);
        return data;
      } catch (error) {
        lastError = error;
        // Backoff before retry (except last attempt)
        if (attempt < this._config.maxRetries - 1) {
          const wait = Math.pow(2, attempt) * 100; // fast-ish backoff for tests
          await new Promise((r) => setTimeout(r, wait));
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    throw lastError;
  }

  _normalizePluginInfo(plugin) {
    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      category: plugin.category,
      tags: plugin.tags || [],
      rating: plugin.rating || 0,
      reviewCount: plugin.reviewCount || 0,
      downloadCount: plugin.downloadCount || 0,
      certified: plugin.certified || false,
      certificationId: plugin.certificationId,
      verifiedPublisher: plugin.verifiedPublisher || false,
      lastUpdated: plugin.lastUpdated,
      createdAt: plugin.createdAt,
      homepage: plugin.homepage,
      repository: plugin.repository,
      license: plugin.license,
      dependencies: plugin.dependencies || [],
      compatibility: plugin.compatibility || {},
      screenshots: plugin.screenshots || [],
      documentation: plugin.documentation,
      checksums: plugin.checksums || {},
    };
  }

  async _getDownloadUrl(pluginId, version) {
    const response = await this._makeRequest(
      'GET',
      `/plugins/${pluginId}/download`,
      { version },
    );
    return response.downloadUrl;
  }

  async _downloadPlugin(url) {
    const doFetch = pickFetch(this._config.fetch);
    if (!doFetch) throw new Error('fetch is not available in this environment');

    const res = await doFetch(url);
    if (!res || !res.ok)
      throw new Error(
        `Download failed: ${res ? res.statusText : 'no response'}`,
      );

    if (typeof res.arrayBuffer === 'function') {
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    }

    if (typeof res.buffer === 'function') {
      return await res.buffer();
    }

    // Very mocked case: tests might hand back a plain Buffer-like in res.body
    if (res.body) return Buffer.from(res.body);

    throw new Error('Unsupported response body for download');
  }

  async _verifyPluginIntegrity(data, checksums) {
    if (!checksums || !checksums.sha256) {
      throw new Error('No checksums available for verification');
    }

    const hash = crypto.createHash('sha256');
    hash.update(Buffer.isBuffer(data) ? data : Buffer.from(data));
    const calculatedHash = hash.digest('hex');

    if (calculatedHash !== checksums.sha256) {
      throw new Error('Plugin integrity verification failed');
    }
  }

  async _installPluginToSystem(pluginData, pluginInfo) {
    const installDir = path.join(
      this._config.localCacheDir,
      'plugins',
      pluginInfo.id,
    );

    // Create installation directory
    await fs.mkdir(installDir, { recursive: true });

    // Simulated install: write metadata only
    const metadataPath = path.join(installDir, 'metadata.json');
    await fs.writeFile(
      metadataPath,
      JSON.stringify(
        {
          ...pluginInfo,
          installedAt: new Date().toISOString(),
          installPath: installDir,
          size: Buffer.isBuffer(pluginData) ? pluginData.length : 0,
        },
        null,
        2,
      ),
    );

    return installDir;
  }

  async _validatePluginForPublish(pluginPath) {
    // Validate plugin structure and metadata
    const packageJsonPath = path.join(pluginPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

    // Required fields validation
    const required = ['name', 'version', 'description', 'main'];
    for (const field of required) {
      if (!packageJson[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Plugin-specific validation
    if (!packageJson.ragPlugin) {
      throw new Error('Missing ragPlugin configuration in package.json');
    }

    return {
      ...packageJson,
      pluginConfig: packageJson.ragPlugin,
    };
  }

  async _packagePlugin(pluginPath, pluginInfo) {
    // Simulate packaging
    return {
      metadata: pluginInfo,
      files: [], // Would contain actual file data in real implementation
    };
  }

  async _uploadPlugin(packageData, _options) {
    return await this._makeRequest('POST', '/plugins/publish', {
      ...packageData,
      ..._options,
    });
  }

  async _getInstalledVersion(pluginId) {
    try {
      const metadataPath = path.join(
        this._config.localCacheDir,
        'plugins',
        pluginId,
        'metadata.json',
      );
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      return metadata.version;
    } catch {
      return null;
    }
  }
}

// Plugin Analytics class for usage tracking
class PluginAnalytics {
  constructor(_config) {
    this._config = _config;
    this._fetch = pickFetch(this._config.fetch);
    this.events = [];

    // In tests, avoid background timers that outlive the suite
    if (process.env.NODE_ENV !== 'test') {
      this.flushInterval = setInterval(() => this._flush(), 60000); // Flush every minute
      if (typeof this.flushInterval?.unref === 'function')
        this.flushInterval.unref();
    }
  }

  trackSearch(query, resultCount) {
    this._track('search', { query, resultCount, timestamp: Date.now() });
  }

  trackPluginView(pluginId) {
    this._track('plugin_view', { pluginId, timestamp: Date.now() });
  }

  trackInstallation(pluginId, version, result) {
    this._track('installation', {
      pluginId,
      version,
      success: !!result.success,
      error: result.error,
      installTime: result.installTime,
      timestamp: Date.now(),
    });
  }

  trackReview(pluginId, rating) {
    this._track('review', { pluginId, rating, timestamp: Date.now() });
  }

  async getLastUsed(pluginId) {
    const usageEvents = this.events.filter(
      (e) => e.type === 'plugin_usage' && e.data.pluginId === pluginId,
    );
    if (usageEvents.length === 0) return null;
    return Math.max(...usageEvents.map((e) => e.timestamp));
  }

  _track(type, data) {
    this.events.push({
      type,
      data,
      sessionId: this._getSessionId(),
      timestamp: Date.now(),
    });

    // Keep only recent events in memory
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500);
    }
  }

  async _flush() {
    if (this.events.length === 0) return;

    // capture and clear
    const eventsToFlush = [...this.events];
    this.events = [];

    // If there's no fetch (e.g., tests didn’t mock global fetch), don't crash.
    const doFetch = pickFetch(this._config.fetch);
    if (!doFetch) return;

    try {
      await doFetch(
        `${this._config.registryUrl.replace(/\/+$/, '')}/analytics`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this._config.userAgent,
          },
          body: JSON.stringify({ events: eventsToFlush }),
        },
      );
    } catch (error) {
      // Silence warnings during tests to avoid "Cannot log after tests are done"
      if (process.env.NODE_ENV !== 'test') {
        // eslint-disable-next-line no-console
        console.warn('Analytics flush failed:', error.message);
      }
    }
  }

  _getSessionId() {
    if (!this.sessionId) this.sessionId = crypto.randomUUID();
    return this.sessionId;
  }
}

// Plugin Sandbox class for isolated execution
class PluginSandbox {
  constructor(_config) {
    this._config = _config;
  }

  async scanPlugin(pluginInfo) {
    // Security scan implementation
    const risks = [];
    const warnings = [];

    // Check for suspicious patterns
    if (pluginInfo.dependencies) {
      for (const dep of Object.keys(pluginInfo.dependencies)) {
        if (this._isSuspiciousDependency(dep)) {
          risks.push(`Suspicious dependency: ${dep}`);
        }
      }
    }

    // Check permissions
    if (pluginInfo.pluginConfig?.permissions) {
      for (const permission of pluginInfo.pluginConfig.permissions) {
        if (this._isHighRiskPermission(permission)) {
          risks.push(`High-risk permission: ${permission}`);
        }
      }
    }

    return {
      risk: risks.length > 0 ? 'high' : warnings.length > 0 ? 'medium' : 'low',
      issues: [...risks, ...warnings],
      recommendations: this._generateRecommendations(risks, warnings),
    };
  }

  async installPlugin(_pluginData, _options) {
    // Sandbox installation simulation
    const sandboxId = crypto.randomUUID();

    try {
      const timeout = Math.max(1, Number(_options?.timeout || 30000));
      const result = await this._runInSandbox(
        sandboxId,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 25)); // faster in tests
          return { success: true };
        },
        { timeout },
      );

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _isSuspiciousDependency(dep) {
    const suspicious = ['eval', 'vm2', 'child_process', 'fs-extra', 'shelljs'];
    return suspicious.some((s) => String(dep).includes(s));
  }

  _isHighRiskPermission(permission) {
    const highRisk = [
      'filesystem:write',
      'network:external',
      'process:spawn',
      'system:admin',
    ];
    return highRisk.includes(permission);
  }

  _generateRecommendations(risks, warnings) {
    const recommendations = [];
    if (risks.length > 0) {
      recommendations.push('Review plugin source code before installation');
      recommendations.push('Install in restricted environment');
    }
    if (warnings.length > 0) {
      recommendations.push('Monitor plugin behavior after installation');
    }
    return recommendations;
  }

  async _runInSandbox(_sandboxId, fn, _options) {
    const timeout = Math.max(1, Number(_options?.timeout || 30000));
    const timerPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Sandbox timeout')), timeout),
    );
    return Promise.race([fn(), timerPromise]);
  }
}

module.exports = {
  PluginHub,
  PluginAnalytics,
  PluginSandbox,
};
