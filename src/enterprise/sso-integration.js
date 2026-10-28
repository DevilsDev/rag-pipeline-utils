/**
 * Enterprise SSO Integration (EXPERIMENTAL - see src/experimental.js)
 * SAML 2.0, OAuth2, Active Directory, and identity provider support
 *
 * Security behaviour (2.5.0):
 * - OAuth2 and OIDC always run the real authorization-code flow with PKCE
 *   (S256). redirect_uri comes from provider configuration (`redirectUri`)
 *   or the server-side login request, never from callback data.
 * - OIDC id_tokens are validated (JWKS signature, iss, aud, exp, nonce).
 * - SAML refuses to authenticate (no vetted XML-signature verification).
 * - Active Directory is only implemented as a development stub.
 * - The development bypass (any code accepted, fixed dev identity) is OFF
 *   by default and only active with `devBypass: true` AND
 *   NODE_ENV !== 'production'; it throws in production and logs a loud
 *   warning otherwise.
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const jwt = require('jsonwebtoken');
const RateLimiter = require('../utils/rate-limiter');
const { logger } = require('../utils/logger');
const { JWTValidator } = require('../security/jwt-validator');
const { createJWTConfig } = require('../security/jwt-config');

class SSOManager extends EventEmitter {
  constructor(_options = {}) {
    super();

    this._config = this._buildConfig(_options);

    if (this._config.devBypass === true) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'SSOManager: devBypass must not be enabled when NODE_ENV=production',
        );
      }
      logger.warn(
        '[SSO] WARNING: SSOManager created with devBypass: true. SSO ' +
          'callbacks will accept any authorization code and issue sessions ' +
          'for a fixed development identity. Never use this outside local ' +
          'development.',
      );
    }

    this.sessions = new Map();
    this.providers = new Map();
    this.userCache = new Map();

    this._initializeRateLimiter();
    this._initializeJWTValidator(_options);
    this._wireJWTEvents();
    this._initializeProviders();
  }

  /**
   * Build the full SSO configuration from user-supplied options.
   * @param {Object} _options - User-supplied configuration options
   * @returns {Object} Complete SSO configuration
   * @private
   */
  _buildConfig(_options) {
    return {
      providers: {
        saml: {
          enabled: false,
          entityId: _options.entityId || 'rag-pipeline-utils',
          ssoUrl: _options.ssoUrl,
          sloUrl: _options.sloUrl,
          certificate: _options.certificate,
          privateKey: _options.privateKey,
        },
        oauth2: {
          enabled: false,
          clientId: _options.clientId,
          clientSecret: _options.clientSecret,
          authorizationUrl: _options.authorizationUrl,
          tokenUrl: _options.tokenUrl,
          userInfoUrl: _options.userInfoUrl,
          redirectUri: _options.redirectUri,
          scopes: ['openid', 'profile', 'email'],
        },
        activeDirectory: {
          enabled: false,
          domain: _options.adDomain,
          url: _options.adUrl,
          baseDN: _options.baseDN,
          bindDN: _options.bindDN,
          bindCredentials: _options.bindCredentials,
          redirectUri: _options.redirectUri,
        },
        oidc: {
          enabled: false,
          issuer: _options.oidcIssuer,
          clientId: _options.oidcClientId,
          clientSecret: _options.oidcClientSecret,
          redirectUri: _options.redirectUri,
        },
      },
      session: {
        timeout: _options.sessionTimeout || 8 * 60 * 60 * 1000, // 8 hours
        renewalThreshold: _options.renewalThreshold || 30 * 60 * 1000, // 30 minutes
        maxConcurrentSessions: _options.maxConcurrentSessions || 5,
      },
      security: {
        jwtSecret: _options.jwtSecret || crypto.randomBytes(64).toString('hex'),
        encryptionKey: _options.encryptionKey || crypto.randomBytes(32),
        tokenExpiry: _options.tokenExpiry || 3600, // 1 hour
        refreshTokenExpiry: _options.refreshTokenExpiry || 7 * 24 * 3600, // 7 days
      },
      rateLimit: {
        enabled: _options.rateLimitEnabled !== false, // Enabled by default
        maxLoginAttempts: _options.maxLoginAttempts || 5,
        loginWindowMs: _options.loginWindowMs || 15 * 60 * 1000, // 15 minutes
        blockDurationMs: _options.blockDurationMs || 60 * 60 * 1000, // 1 hour
      },
      ..._options,
      // Development bypass: off unless explicitly requested
      devBypass: _options.devBypass === true,
    };
  }

  /**
   * Create and configure the rate limiter for login attempt throttling.
   * @private
   */
  _initializeRateLimiter() {
    if (this._config.rateLimit.enabled) {
      this.rateLimiter = new RateLimiter({
        maxAttempts: this._config.rateLimit.maxLoginAttempts,
        windowMs: this._config.rateLimit.loginWindowMs,
        blockDurationMs: this._config.rateLimit.blockDurationMs,
      });
    }
  }

  /**
   * Create and configure the hardened JWT validator for token operations.
   * @param {Object} _options - Original user-supplied options for JWT settings
   * @private
   */
  _initializeJWTValidator(_options) {
    this.jwtValidator = new JWTValidator(
      createJWTConfig({
        secret: this._config.security.jwtSecret,
        algorithm: _options.jwtAlgorithm || 'HS256',
        allowedAlgorithms: _options.jwtAllowedAlgorithms || ['HS256'],
        issuer: _options.jwtIssuer || 'rag-pipeline-utils',
        audience: _options.jwtAudience || 'rag-pipeline-api',
        maxTokenAge: this._config.security.tokenExpiry,
        clockTolerance: _options.jwtClockTolerance || 30,
        requireJti: _options.jwtRequireJti !== false,
        requireSub: _options.jwtRequireSub !== false,
        enableJtiTracking: _options.jwtEnableJtiTracking !== false,
        enableAuditLog: _options.jwtEnableAuditLog !== false,
      }),
    );
  }

  /**
   * Forward JWT validator events to the SSOManager for audit logging.
   * @private
   */
  _wireJWTEvents() {
    const eventMappings = [
      ['token_generated', 'jwt_token_generated'],
      ['token_validated', 'jwt_token_validated'],
      ['validation_failed', 'jwt_validation_failed'],
      ['algorithm_mismatch', 'jwt_algorithm_mismatch'],
      ['replay_detected', 'jwt_replay_detected'],
    ];

    for (const [sourceEvent, targetEvent] of eventMappings) {
      this.jwtValidator.on(sourceEvent, (event) => {
        this.emit(targetEvent, event);
      });
    }
  }

  /**
   * Initialize SSO providers
   */
  _initializeProviders() {
    // Synchronous so configuration errors (e.g. devBypass in production)
    // surface from the constructor instead of as unhandled rejections.
    const providers = this._config.providers || {};
    const withBypass = (providerConfig) => ({
      ...providerConfig,
      devBypass:
        this._config.devBypass === true || providerConfig.devBypass === true,
    });

    if (providers.saml && providers.saml.enabled) {
      this.providers.set('saml', new SAMLProvider(withBypass(providers.saml)));
    }

    if (providers.oauth2 && providers.oauth2.enabled) {
      this.providers.set(
        'oauth2',
        new OAuth2Provider(withBypass(providers.oauth2)),
      );
    }

    if (providers.activeDirectory && providers.activeDirectory.enabled) {
      this.providers.set(
        'ad',
        new ActiveDirectoryProvider(withBypass(providers.activeDirectory)),
      );
    }

    if (providers.oidc && providers.oidc.enabled) {
      this.providers.set('oidc', new OIDCProvider(withBypass(providers.oidc)));
    }
  }

  /**
   * Initiate SSO login
   */
  async initiateLogin(tenantId, provider, _redirectUrl) {
    const ssoProvider = this.providers.get(provider);
    if (!ssoProvider) {
      throw new Error(`SSO provider ${provider} not configured`);
    }

    // Rate limiting check
    if (this.rateLimiter) {
      const identifier = `${tenantId}:${provider}`;
      const rateLimitResult = this.rateLimiter.allowRequest(identifier);

      if (!rateLimitResult.allowed) {
        this.emit('login_rate_limited', {
          tenantId,
          provider,
          blockedUntil: rateLimitResult.blockedUntil,
          retryAfter: rateLimitResult.retryAfter,
        });

        const error = new Error(
          'Too many login attempts. Please try again later.',
        );
        error.code = 'RATE_LIMIT_EXCEEDED';
        error.retryAfter = rateLimitResult.retryAfter;
        error.blockedUntil = rateLimitResult.blockedUntil;
        throw error;
      }
    }

    const state = crypto.randomUUID();
    const { codeVerifier, codeChallenge } = createPkcePair();
    const loginRequest = {
      tenantId,
      provider,
      state,
      _redirectUrl,
      // Server-side only: PKCE verifier, OIDC nonce and the redirect_uri
      // sent in the authorization request (configured value preferred).
      codeVerifier,
      nonce: crypto.randomBytes(16).toString('base64url'),
      redirectUri:
        (ssoProvider._config && ssoProvider._config.redirectUri) ||
        _redirectUrl,
      timestamp: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    // Store login request for callback validation
    this.sessions.set(state, loginRequest);

    const authUrl = await ssoProvider.getAuthorizationUrl(state, _redirectUrl, {
      codeChallenge,
      nonce: loginRequest.nonce,
      redirectUri: loginRequest.redirectUri,
    });

    this.emit('login_initiated', { tenantId, provider, state });

    return {
      authUrl,
      state,
      expiresAt: loginRequest.expiresAt,
    };
  }

  /**
   * Handle SSO callback
   */
  async handleCallback(provider, _callbackData) {
    const ssoProvider = this.providers.get(provider);
    if (!ssoProvider) {
      throw new Error(`SSO provider ${provider} not configured`);
    }

    if (
      !_callbackData ||
      typeof _callbackData !== 'object' ||
      typeof _callbackData.state !== 'string'
    ) {
      throw new Error('Invalid or expired login request');
    }

    const loginRequest = this.sessions.get(_callbackData.state);
    // Only login requests (not sessions) are keyed by state; they carry it.
    if (!loginRequest || loginRequest.state !== _callbackData.state) {
      throw new Error('Invalid or expired login request');
    }

    // A state is single-use: consume it before doing anything else
    this.sessions.delete(_callbackData.state);

    if (loginRequest.provider !== provider) {
      this.emit('login_provider_mismatch', {
        tenantId: loginRequest.tenantId,
        expected: loginRequest.provider,
        received: provider,
      });
      throw new Error('Login request provider mismatch');
    }

    if (loginRequest.expiresAt < Date.now()) {
      throw new Error('Login request expired');
    }

    const loginContext = {
      state: loginRequest.state,
      codeVerifier: loginRequest.codeVerifier,
      nonce: loginRequest.nonce,
      redirectUri: loginRequest.redirectUri,
    };

    // Exchange authorization code for tokens
    const tokenData = await ssoProvider.exchangeCodeForTokens(
      _callbackData,
      loginContext,
    );

    // Get user information
    const userInfo = await ssoProvider.getUserInfo(
      tokenData._accessToken,
      tokenData,
    );

    // Create internal user session
    const session = await this._createUserSession(
      loginRequest.tenantId,
      userInfo,
      provider,
      tokenData,
    );

    this.emit('login_completed', {
      tenantId: loginRequest.tenantId,
      provider,
      userId: userInfo.id,
      sessionId: session.id,
    });

    return {
      session,
      user: userInfo,
      redirectUrl: loginRequest._redirectUrl,
    };
  }

  /**
   * Create user session with JWT tokens
   */
  async _createUserSession(tenantId, userInfo, provider, tokenData) {
    const sessionId = crypto.randomUUID();
    const now = Date.now();

    // Check concurrent session limits
    const userSessions = Array.from(this.sessions.values()).filter(
      (s) => s.userId === userInfo.id && s.tenantId === tenantId,
    );

    if (userSessions.length >= this._config.session.maxConcurrentSessions) {
      // Remove oldest session
      const oldestSession = userSessions.sort(
        (a, b) => a.createdAt - b.createdAt,
      )[0];
      this.sessions.delete(oldestSession.id);
      this.emit('session_evicted', {
        sessionId: oldestSession.id,
        reason: 'concurrent_limit',
      });
    }

    const session = {
      id: sessionId,
      tenantId,
      userId: userInfo.id,
      provider,
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        roles: userInfo.roles || [],
        groups: userInfo.groups || [],
        attributes: userInfo.attributes || {},
      },
      tokens: {
        _accessToken: this._generateJWT({
          sub: userInfo.id,
          tenant: tenantId,
          provider,
          roles: userInfo.roles || [],
          exp: Math.floor(now / 1000) + this._config.security.tokenExpiry,
        }),
        refreshToken: this._generateRefreshToken(),
        externalTokens: {
          accessToken: tokenData._accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
        },
      },
      metadata: {
        createdAt: now,
        lastActivity: now,
        expiresAt: now + this._config.session.timeout,
        ipAddress: tokenData.ipAddress,
        userAgent: tokenData.userAgent,
      },
    };

    this.sessions.set(sessionId, session);
    this.userCache.set(`${tenantId}:${userInfo.id}`, userInfo);

    return session;
  }

  /**
   * Validate and refresh session
   */
  async validateSession(sessionId, tenantId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.tenantId !== tenantId) {
      throw new Error('Session tenant mismatch');
    }

    const now = Date.now();

    // Check if session expired
    if (session.metadata.expiresAt < now) {
      this.sessions.delete(sessionId);
      this.emit('session_expired', { sessionId, tenantId });
      throw new Error('Session expired');
    }

    // Check if session needs renewal
    const renewalTime =
      session.metadata.expiresAt - this._config.session.renewalThreshold;
    if (now > renewalTime) {
      await this._renewSession(session);
    }

    // Update last activity
    session.metadata.lastActivity = now;

    return session;
  }

  /**
   * Renew session tokens
   */
  async _renewSession(session) {
    const _provider = this.providers.get(session.provider);
    if (!_provider) {
      throw new Error(`Provider ${session.provider} not available`);
    }

    try {
      // Refresh external tokens if needed
      if (session.tokens.externalTokens.refreshToken) {
        const newTokens = await _provider.refreshTokens(
          session.tokens.externalTokens.refreshToken,
        );
        session.tokens.externalTokens = newTokens;
      }

      // Generate new internal tokens
      const now = Date.now();
      session.tokens.accessToken = this._generateJWT({
        sub: session.userId,
        tenant: session.tenantId,
        provider: session.provider,
        roles: session.user.roles,
        exp: Math.floor(now / 1000) + this._config.security.tokenExpiry,
      });

      session.metadata.expiresAt = now + this._config.session.timeout;

      this.emit('session_renewed', {
        sessionId: session.id,
        tenantId: session.tenantId,
      });
    } catch (error) {
      this.emit('session_renewal_failed', {
        sessionId: session.id,
        tenantId: session.tenantId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Logout user and invalidate session
   */
  async logout(sessionId, tenantId, _options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) {
      return { success: false, reason: 'session_not_found' };
    }

    // Perform SSO logout if supported
    if (_options.ssoLogout) {
      const provider = this.providers.get(session.provider);
      if (provider && provider.logout) {
        try {
          await provider.logout(session.tokens.externalTokens._accessToken);
        } catch (error) {
          this.emit('sso_logout_failed', {
            sessionId,
            tenantId,
            provider: session.provider,
            error: error.message,
          });
        }
      }
    }

    // Remove session
    this.sessions.delete(sessionId);

    this.emit('logout_completed', {
      sessionId,
      tenantId,
      userId: session.userId,
      provider: session.provider,
    });

    return { success: true };
  }

  /**
   * Get user information from session
   */
  async getUser(sessionId, tenantId) {
    const session = await this.validateSession(sessionId, tenantId);
    return session.user;
  }

  /**
   * List active sessions for a tenant
   */
  async getActiveSessions(tenantId, _options = {}) {
    const sessions = Array.from(this.sessions.values())
      .filter((s) => s.tenantId === tenantId)
      .map((s) => ({
        id: s.id,
        userId: s.userId,
        provider: s.provider,
        user: _options.includeUserInfo
          ? s.user
          : { id: s.user.id, email: s.user.email },
        metadata: s.metadata,
      }));

    return sessions;
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeUserSessions(tenantId, userId, excludeSessionId = null) {
    const userSessions = Array.from(this.sessions.entries()).filter(
      ([sessionId, session]) =>
        session.tenantId === tenantId &&
        session.userId === userId &&
        sessionId !== excludeSessionId,
    );

    for (const [sessionId] of userSessions) {
      this.sessions.delete(sessionId);
      this.emit('session_revoked', {
        sessionId,
        tenantId,
        userId,
        reason: 'admin_revoke',
      });
    }

    return { revokedSessions: userSessions.length };
  }

  /**
   * Generate JWT token using hardened JWT validator
   * @param {object} payload - JWT payload
   * @returns {string} Signed JWT token
   */
  _generateJWT(payload) {
    try {
      return this.jwtValidator.sign(payload, {
        expiresIn: this._config.security.tokenExpiry,
      });
    } catch (error) {
      this.emit('jwt_generation_failed', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`JWT generation failed: ${error.message}`);
    }
  }

  /**
   * Verify and decode JWT token using hardened validator
   * @param {string} token - JWT token to verify
   * @returns {object} Decoded payload
   */
  _verifyJWT(token) {
    try {
      return this.jwtValidator.verify(token);
    } catch (error) {
      this.emit('jwt_verification_failed', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Generate refresh token
   */
  _generateRefreshToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.metadata.expiresAt < now) {
        expiredSessions.push(sessionId);
        this.sessions.delete(sessionId);
        this.emit('session_expired', { sessionId, tenantId: session.tenantId });
      }
    }

    return { cleanedSessions: expiredSessions.length };
  }

  /**
   * Reset rate limit for a specific tenant/provider
   * @param {string} tenantId - Tenant identifier
   * @param {string} provider - Provider name
   */
  resetRateLimit(tenantId, provider) {
    if (this.rateLimiter) {
      const identifier = `${tenantId}:${provider}`;
      this.rateLimiter.reset(identifier);
      this.emit('rate_limit_reset', { tenantId, provider });
    }
  }

  /**
   * Get rate limit status for a tenant/provider
   * @param {string} tenantId - Tenant identifier
   * @param {string} provider - Provider name
   * @returns {Object} Rate limit status
   */
  getRateLimitStatus(tenantId, provider) {
    if (!this.rateLimiter) {
      return { enabled: false };
    }

    const identifier = `${tenantId}:${provider}`;
    return {
      enabled: true,
      ...this.rateLimiter.getStatus(identifier),
    };
  }

  /**
   * Get rate limiter statistics
   * @returns {Object} Statistics about rate limiting
   */
  getRateLimiterStats() {
    if (!this.rateLimiter) {
      return { enabled: false };
    }

    return {
      enabled: true,
      ...this.rateLimiter.getStats(),
    };
  }

  /**
   * Get JWT validator statistics
   * @returns {Object} JWT validation statistics
   */
  getJWTStats() {
    return this.jwtValidator.getStats();
  }

  /**
   * Destroy SSO manager and cleanup resources
   */
  destroy() {
    if (this.rateLimiter) {
      this.rateLimiter.destroy();
      this.rateLimiter = null;
    }

    if (this.jwtValidator) {
      this.jwtValidator.destroy();
      this.jwtValidator = null;
    }

    this.sessions.clear();
    this.providers.clear();
    this.userCache.clear();
    this.removeAllListeners();
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SAML_UNSUPPORTED_MESSAGE =
  'SAML authentication is not supported: SAML assertions cannot be verified ' +
  'without a vetted XML-signature library, so SAMLProvider refuses to ' +
  'authenticate. Use the OIDC provider instead (or devBypass: true outside ' +
  'production for local testing only).';

const DEFAULT_ID_TOKEN_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
];

/**
 * True when the development bypass is active for a provider: it must be
 * requested explicitly (devBypass: true) AND NODE_ENV must not be
 * "production". Evaluated at call time.
 * @param {Object} config - Provider configuration
 * @returns {boolean}
 */
function isDevBypassActive(config) {
  return (
    Boolean(config) &&
    config.devBypass === true &&
    process.env.NODE_ENV !== 'production'
  );
}

/**
 * Refuse devBypass in production and warn loudly when it is enabled.
 * @param {string} providerName - Provider name for the message
 * @param {Object} config - Provider configuration
 */
function checkDevBypass(providerName, config) {
  if (!config || config.devBypass !== true) return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${providerName}: devBypass must not be enabled when NODE_ENV=production`,
    );
  }
  logger.warn(
    `[SSO] WARNING: devBypass is ENABLED for ${providerName}. Any ` +
      'authorization code with a valid state is accepted and a session is ' +
      'issued for a fixed development identity. Never enable this outside ' +
      'local development.',
  );
}

/**
 * Create a PKCE (RFC 7636, S256) verifier/challenge pair.
 * @returns {{codeVerifier: string, codeChallenge: string}}
 */
function createPkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Build a token-endpoint request (authorization_code grant with PKCE).
 * Confidential clients authenticate with HTTP Basic; public clients send
 * client_id in the body.
 * @private
 */
function buildCodeExchangeRequest(config, code, redirectUri, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  if (config.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString('base64')}`;
  } else {
    body.set('client_id', config.clientId);
  }
  return { method: 'POST', headers, body };
}

/**
 * Validate the common inputs of a real (non-bypass) code exchange.
 * redirect_uri comes from provider configuration (or the server-side login
 * request), never from callback data.
 * @private
 */
function requireExchangeInputs(providerName, config, callbackData, ctx) {
  if (!callbackData.code || typeof callbackData.code !== 'string') {
    throw new Error('Authorization code is required');
  }
  const redirectUri = config.redirectUri || (ctx && ctx.redirectUri);
  if (!redirectUri) {
    throw new Error(
      `${providerName}: redirectUri must be configured for the provider`,
    );
  }
  if (!ctx || !ctx.codeVerifier) {
    throw new Error(
      `${providerName}: PKCE code_verifier missing; use SSOManager.initiateLogin()/handleCallback()`,
    );
  }
  return redirectUri;
}

function assertCallbackData(callbackData) {
  if (!callbackData || typeof callbackData !== 'object') {
    throw new Error('Callback data is required');
  }
}

// SSO Provider implementations
class SAMLProvider {
  /**
   * SAML 2.0 provider.
   *
   * Real SAML authentication is NOT supported: verifying SAML assertions
   * requires XML canonicalization and XML-signature verification, which
   * must come from a vetted library rather than hand-written code. Every
   * authentication method throws unless the explicit development bypass is
   * active (devBypass: true and NODE_ENV !== 'production').
   *
   * @param {Object} _config - Provider configuration
   */
  constructor(_config = {}) {
    this._config = _config;
    checkDevBypass('SAMLProvider', this._config);
  }

  async getAuthorizationUrl(state, _redirectUrl) {
    // SAML SSO URL construction
    const params = new URLSearchParams({
      SAMLRequest: this._buildSAMLRequest(state),
      RelayState: state,
    });

    return `${this._config.ssoUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(_callbackData) {
    assertCallbackData(_callbackData);
    // SAML assertion processing
    const assertion = this._validateSAMLResponse(_callbackData.SAMLResponse);

    return {
      _accessToken: assertion.sessionIndex,
      assertion,
      refreshToken: null,
      expiresAt: assertion.notOnOrAfter,
    };
  }

  async getUserInfo(_accessToken, tokenData = {}) {
    if (!isDevBypassActive(this._config)) {
      throw new Error(SAML_UNSUPPORTED_MESSAGE);
    }
    // Extract user info from the (development-only) SAML assertion
    const assertion = tokenData.assertion || _accessToken;
    return {
      id: assertion.nameID,
      email: assertion.attributes.email,
      name: assertion.attributes.displayName,
      roles: assertion.attributes.roles || [],
      groups: assertion.attributes.groups || [],
    };
  }

  _buildSAMLRequest(state) {
    if (!isDevBypassActive(this._config)) {
      throw new Error(SAML_UNSUPPORTED_MESSAGE);
    }

    // Development bypass only
    return Buffer.from(
      `<samlp:AuthnRequest ID="${state}" Version="2.0" IssueInstant="${new Date().toISOString()}" xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
        <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${this._config.entityId}</saml:Issuer>
        <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress" AllowCreate="true"/>
      </samlp:AuthnRequest>`,
    ).toString('base64');
  }

  _validateSAMLResponse(response) {
    if (!isDevBypassActive(this._config)) {
      throw new Error(SAML_UNSUPPORTED_MESSAGE);
    }

    if (!response) {
      throw new Error('SAML response is required');
    }

    // Development bypass only: the response is NOT verified
    try {
      const decodedResponse = Buffer.from(response, 'base64').toString('utf8');

      if (!decodedResponse.includes('samlp:Response')) {
        throw new Error('Invalid SAML response format');
      }

      return {
        sessionIndex: crypto.randomUUID(),
        nameID: 'dev-user@example.com',
        attributes: {
          email: 'dev-user@example.com',
          displayName: 'Development User',
          roles: ['user', 'dev'],
        },
        notOnOrAfter: Date.now() + 8 * 60 * 60 * 1000,
      };
    } catch (error) {
      throw new Error(`SAML response validation failed: ${error.message}`);
    }
  }
}

class OAuth2Provider {
  /**
   * OAuth 2.0 authorization-code provider with PKCE (S256).
   *
   * @param {Object} _config - clientId, clientSecret (optional for public
   *   clients), authorizationUrl, tokenUrl, userInfoUrl, redirectUri,
   *   scopes, devBypass
   */
  constructor(_config = {}) {
    this._config = { scopes: ['openid', 'profile', 'email'], ..._config };
    checkDevBypass('OAuth2Provider', this._config);
  }

  /**
   * @param {string} state - Opaque state bound to the login request
   * @param {string} [_redirectUrl] - Fallback redirect_uri when none is configured
   * @param {Object} [loginContext] - { codeChallenge, redirectUri } from SSOManager
   */
  async getAuthorizationUrl(state, _redirectUrl, loginContext = {}) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this._config.clientId,
      redirect_uri:
        this._config.redirectUri || loginContext.redirectUri || _redirectUrl,
      scope: this._config.scopes.join(' '),
      state,
    });
    if (loginContext.codeChallenge) {
      params.set('code_challenge', loginContext.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    return `${this._config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchange the authorization code. redirect_uri is taken from provider
   * configuration (or the server-side login request), never from
   * callbackData, and the PKCE code_verifier from the login request.
   *
   * @param {Object} callbackData - { code, state }
   * @param {Object} [loginContext] - { codeVerifier, redirectUri }
   */
  async exchangeCodeForTokens(callbackData, loginContext = {}) {
    assertCallbackData(callbackData);

    if (isDevBypassActive(this._config)) {
      if (!callbackData.code) {
        throw new Error('Authorization code is required');
      }
      return {
        _accessToken: crypto.randomBytes(32).toString('hex'),
        refreshToken: crypto.randomBytes(32).toString('hex'),
        expiresAt: Date.now() + 3600 * 1000,
      };
    }

    const redirectUri = requireExchangeInputs(
      'OAuth2Provider',
      this._config,
      callbackData,
      loginContext,
    );
    const tokenRequest = buildCodeExchangeRequest(
      this._config,
      callbackData.code,
      redirectUri,
      loginContext.codeVerifier,
    );

    try {
      const response = await fetch(this._config.tokenUrl, tokenRequest);

      if (!response.ok) {
        throw new Error(
          `Token exchange failed: ${response.status} ${response.statusText}`,
        );
      }

      const tokenData = await response.json();

      return {
        _accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
        tokenType: tokenData.token_type || 'Bearer',
      };
    } catch (error) {
      throw new Error(`OAuth2 token exchange failed: ${error.message}`);
    }
  }

  async getUserInfo(accessToken) {
    if (isDevBypassActive(this._config)) {
      return {
        id: 'dev-' + crypto.randomUUID(),
        email: 'dev-oauth-user@example.com',
        name: 'Development OAuth User',
        roles: ['user', 'dev'],
      };
    }

    try {
      const userResponse = await fetch(this._config.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!userResponse.ok) {
        throw new Error(`User info request failed: ${userResponse.status}`);
      }

      const userData = await userResponse.json();

      return {
        id: userData.id || userData.sub,
        email: userData.email,
        name: userData.name || userData.display_name,
        roles: userData.roles || [],
        attributes: userData,
      };
    } catch (error) {
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }

  async refreshTokens(refreshToken) {
    if (isDevBypassActive(this._config)) {
      return {
        _accessToken: crypto.randomBytes(32).toString('hex'),
        refreshToken: refreshToken,
        expiresAt: Date.now() + 3600 * 1000,
      };
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (this._config.clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(
        `${this._config.clientId}:${this._config.clientSecret}`,
      ).toString('base64')}`;
    } else {
      body.set('client_id', this._config.clientId);
    }

    try {
      const response = await fetch(this._config.tokenUrl, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const tokenData = await response.json();

      return {
        _accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refreshToken,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
      };
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }
}

class ActiveDirectoryProvider {
  /**
   * Active Directory provider. Only the development bypass is implemented;
   * for AD FS / Entra ID use the OIDC provider, which both support.
   * @param {Object} _config - Provider configuration
   */
  constructor(_config = {}) {
    this._config = _config;
    checkDevBypass('ActiveDirectoryProvider', this._config);
  }

  async getAuthorizationUrl(state, _redirectUrl, loginContext = {}) {
    // AD FS OAuth2 flow
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this._config.clientId || 'rag-pipeline-utils',
      resource: this._config.url,
      redirect_uri:
        this._config.redirectUri || loginContext.redirectUri || _redirectUrl,
      state,
    });
    if (loginContext.codeChallenge) {
      params.set('code_challenge', loginContext.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    return `${this._config.url}/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(callbackData) {
    assertCallbackData(callbackData);
    if (!isDevBypassActive(this._config)) {
      throw new Error(
        'Production Active Directory integration required - please configure AD FS or Azure AD (use the OIDC provider)',
      );
    }

    // Development bypass only
    if (!callbackData.code) {
      throw new Error('Authorization code is required');
    }

    return {
      _accessToken: crypto.randomBytes(32).toString('hex'),
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresAt: Date.now() + 3600 * 1000,
    };
  }

  async getUserInfo(_accessToken) {
    if (!isDevBypassActive(this._config)) {
      throw new Error(
        'Production Active Directory user lookup required - please configure AD integration (use the OIDC provider)',
      );
    }

    // Development bypass only
    return {
      id: 'dev-' + crypto.randomUUID(),
      email: 'dev-user@corp.com',
      name: 'Development AD User',
      roles: ['user', 'dev'],
      groups: ['Domain Users', 'Developers'],
    };
  }
}

class OIDCProvider {
  /**
   * OpenID Connect provider (authorization code + PKCE, validated id_token).
   *
   * Endpoints and keys come from discovery
   * (`<issuer>/.well-known/openid-configuration`) unless configured:
   * authorizationUrl, tokenUrl, userInfoUrl, jwksUri, or `jwks` (a JWK Set
   * `{ keys: [...] }` or an array of JWKs) to avoid fetching keys.
   *
   * The id_token must be signed by a key from the provider JWKS (selected
   * by `kid`) with an asymmetric algorithm (`idTokenAlgorithms`, default
   * RS/PS/ES 256-512), and its iss, aud (clientId), exp and nonce are
   * checked.
   *
   * @param {Object} _config - issuer, clientId, clientSecret, redirectUri,
   *   scopes, jwks, jwksUri, authorizationUrl, tokenUrl, userInfoUrl,
   *   idTokenAlgorithms, clockTolerance (seconds, default 60), devBypass
   */
  constructor(_config = {}) {
    this._config = _config;
    this._metadata = null;
    this._jwks = null;
    checkDevBypass('OIDCProvider', this._config);
  }

  /**
   * Resolve provider metadata (configured values override discovery).
   * @returns {Promise<Object>}
   */
  async getMetadata() {
    if (this._metadata) return this._metadata;

    const configured = {
      issuer: this._config.issuer,
      authorization_endpoint: this._config.authorizationUrl,
      token_endpoint: this._config.tokenUrl,
      userinfo_endpoint: this._config.userInfoUrl,
      jwks_uri: this._config.jwksUri,
    };

    const needsDiscovery =
      !configured.authorization_endpoint ||
      !configured.token_endpoint ||
      (!configured.jwks_uri && !this._config.jwks);

    let discovered = {};
    if (needsDiscovery) {
      if (!this._config.issuer) {
        throw new Error('OIDC issuer must be configured');
      }
      const url = `${this._config.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`OIDC discovery failed: ${response.status}`);
      }
      discovered = await response.json();
      if (discovered.issuer !== this._config.issuer) {
        throw new Error(
          `OIDC discovery issuer mismatch: expected ${this._config.issuer}, got ${discovered.issuer}`,
        );
      }
    }

    const metadata = { ...discovered };
    for (const [key, value] of Object.entries(configured)) {
      if (value) metadata[key] = value;
    }
    this._metadata = metadata;
    return metadata;
  }

  async getAuthorizationUrl(state, _redirectUrl, loginContext = {}) {
    const metadata = await this.getMetadata();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this._config.clientId,
      redirect_uri:
        this._config.redirectUri || loginContext.redirectUri || _redirectUrl,
      scope: (this._config.scopes || ['openid', 'profile', 'email']).join(' '),
      state,
    });
    if (loginContext.nonce) {
      params.set('nonce', loginContext.nonce);
    }
    if (loginContext.codeChallenge) {
      params.set('code_challenge', loginContext.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    return `${metadata.authorization_endpoint}?${params.toString()}`;
  }

  /**
   * Exchange the code and validate the returned id_token.
   * @param {Object} callbackData - { code, state }
   * @param {Object} [loginContext] - { codeVerifier, nonce, redirectUri }
   */
  async exchangeCodeForTokens(callbackData, loginContext = {}) {
    assertCallbackData(callbackData);

    if (isDevBypassActive(this._config)) {
      if (!callbackData.code) {
        throw new Error('Authorization code is required');
      }
      return {
        _accessToken: crypto.randomBytes(32).toString('hex'),
        refreshToken: crypto.randomBytes(32).toString('hex'),
        idToken: this._generateMockIdToken(),
        expiresAt: Date.now() + 3600 * 1000,
      };
    }

    const redirectUri = requireExchangeInputs(
      'OIDCProvider',
      this._config,
      callbackData,
      loginContext,
    );
    if (!loginContext.nonce) {
      throw new Error(
        'OIDCProvider: nonce missing; use SSOManager.initiateLogin()/handleCallback()',
      );
    }

    let tokenData;
    try {
      const metadata = await this.getMetadata();
      const response = await fetch(
        metadata.token_endpoint,
        buildCodeExchangeRequest(
          this._config,
          callbackData.code,
          redirectUri,
          loginContext.codeVerifier,
        ),
      );

      if (!response.ok) {
        throw new Error(`OIDC token exchange failed: ${response.status}`);
      }

      tokenData = await response.json();
    } catch (error) {
      throw new Error(`OIDC token exchange failed: ${error.message}`);
    }

    if (!tokenData.id_token) {
      throw new Error('OIDC token response did not include an id_token');
    }
    const claims = await this.validateIdToken(tokenData.id_token, {
      nonce: loginContext.nonce,
    });

    return {
      _accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      idToken: tokenData.id_token,
      claims,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };
  }

  /**
   * Validate an id_token: signature (provider JWKS), iss, aud, exp, nonce.
   * @param {string} idToken - Compact JWS
   * @param {Object} options - { nonce } expected nonce (required)
   * @returns {Promise<Object>} Verified claims
   */
  async validateIdToken(idToken, { nonce } = {}) {
    try {
      if (!nonce) {
        throw new Error('expected nonce is required');
      }
      const decoded = jwt.decode(idToken, { complete: true });
      if (!decoded || !decoded.header || !decoded.payload) {
        throw new Error('malformed id_token');
      }
      const { header, payload } = decoded;
      const allowed =
        this._config.idTokenAlgorithms || DEFAULT_ID_TOKEN_ALGORITHMS;
      if (!allowed.includes(header.alg)) {
        throw new Error(`algorithm ${header.alg} is not allowed`);
      }

      const jwk = await this._selectJwk(header);
      if (jwk.alg && jwk.alg !== header.alg) {
        throw new Error('JWK algorithm does not match the token');
      }
      const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });

      if (typeof payload.exp !== 'number') {
        throw new Error('id_token has no exp claim');
      }
      if (!payload.sub) {
        throw new Error('id_token has no sub claim');
      }

      const claims = jwt.verify(idToken, key, {
        algorithms: [header.alg],
        issuer: this._config.issuer,
        audience: this._config.clientId,
        nonce,
        clockTolerance: this._config.clockTolerance ?? 60,
      });

      if (
        Array.isArray(claims.aud) &&
        claims.aud.length > 1 &&
        claims.azp !== this._config.clientId
      ) {
        throw new Error('azp does not match client_id');
      }
      return claims;
    } catch (error) {
      throw new Error(`OIDC id_token validation failed: ${error.message}`);
    }
  }

  /**
   * Pick the verification key for a token header from the JWKS.
   * Refetches the JWKS once when the kid is unknown (key rotation).
   * @private
   */
  async _selectJwk(header) {
    const find = (keys) => {
      const candidates = keys.filter(
        (k) => (!k.use || k.use === 'sig') && k.kty !== 'oct',
      );
      if (header.kid) {
        return candidates.find((k) => k.kid === header.kid);
      }
      return candidates.length === 1 ? candidates[0] : undefined;
    };

    let jwk = find(await this._getJwks(false));
    if (!jwk && !this._config.jwks) {
      jwk = find(await this._getJwks(true));
    }
    if (!jwk) {
      throw new Error(
        header.kid
          ? `no signing key found for kid ${header.kid}`
          : 'token has no kid and the JWKS does not have exactly one signing key',
      );
    }
    return jwk;
  }

  /** @private */
  async _getJwks(forceRefresh) {
    if (this._config.jwks) {
      const configured = this._config.jwks;
      return Array.isArray(configured) ? configured : configured.keys || [];
    }
    if (this._jwks && !forceRefresh) return this._jwks;

    const metadata = await this.getMetadata();
    if (!metadata.jwks_uri) {
      throw new Error('provider metadata has no jwks_uri');
    }
    const response = await fetch(metadata.jwks_uri, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`JWKS request failed: ${response.status}`);
    }
    const body = await response.json();
    this._jwks = Array.isArray(body.keys) ? body.keys : [];
    return this._jwks;
  }

  /**
   * @param {string} accessToken - Access token for the userinfo endpoint
   * @param {Object} [tokenData] - Result of exchangeCodeForTokens; when it
   *   carries validated id_token claims, the userinfo `sub` must match.
   */
  async getUserInfo(accessToken, tokenData = {}) {
    if (isDevBypassActive(this._config)) {
      return {
        id: 'dev-' + crypto.randomUUID(),
        email: 'dev-user@oidc.com',
        name: 'Development OIDC User',
        roles: ['user', 'dev'],
      };
    }

    const claims = tokenData.claims;
    try {
      const metadata = await this.getMetadata();
      let userData;
      if (metadata.userinfo_endpoint) {
        const userResponse = await fetch(metadata.userinfo_endpoint, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        });

        if (!userResponse.ok) {
          throw new Error(
            `OIDC userinfo request failed: ${userResponse.status}`,
          );
        }

        userData = await userResponse.json();
        if (claims && userData.sub !== claims.sub) {
          throw new Error('userinfo sub does not match the id_token sub');
        }
      } else if (claims) {
        userData = claims;
      } else {
        throw new Error('no userinfo endpoint and no validated id_token');
      }

      return {
        id: userData.sub,
        email: userData.email,
        name: userData.name || userData.preferred_username,
        roles: userData.roles || [],
        groups: userData.groups || [],
        attributes: userData,
      };
    } catch (error) {
      throw new Error(`OIDC getUserInfo failed: ${error.message}`);
    }
  }

  _generateMockIdToken() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Mock ID token generation not allowed in production');
    }

    // Development bypass only - basic JWT structure, NOT a verifiable token
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'dev-user-' + crypto.randomUUID(),
        iss: this._config.issuer || 'dev-issuer',
        aud: this._config.clientId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        email: 'dev-user@oidc.com',
        name: 'Development OIDC User',
      }),
    ).toString('base64url');
    const signature = crypto
      .createHmac('sha256', 'dev-secret')
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }
}

module.exports = {
  SSOManager,
  SAMLProvider,
  OAuth2Provider,
  ActiveDirectoryProvider,
  OIDCProvider,
  createPkcePair,
};
