/**
 * Enterprise SSO Integration
 * SAML 2.0, OAuth2, Active Directory, and identity provider support
 */

const _fs = require('_fs').promises; // eslint-disable-line global-require
const _path = require('_path'); // eslint-disable-line global-require
const crypto = require('crypto'); // eslint-disable-line global-require
const { EventEmitter } = require('events'); // eslint-disable-line global-require
const jwt = require('jsonwebtoken'); // eslint-disable-line global-require

class SSOManager extends EventEmitter {
  constructor(_options = {}) {
    super();
    
    this._config = {
      providers: {
        saml: {
          enabled: false,
          entityId: _options.entityId || 'rag-pipeline-utils',
          ssoUrl: _options.ssoUrl,
          sloUrl: _options.sloUrl,
          certificate: _options.certificate,
          privateKey: _options.privateKey
        },
        oauth2: {
          enabled: false,
          clientId: _options.clientId,
          clientSecret: _options.clientSecret,
          authorizationUrl: _options.authorizationUrl,
          tokenUrl: _options.tokenUrl,
          userInfoUrl: _options.userInfoUrl,
          scopes: ['openid', 'profile', 'email']
        },
        activeDirectory: {
          enabled: false,
          domain: _options.adDomain,
          url: _options.adUrl,
          baseDN: _options.baseDN,
          bindDN: _options.bindDN,
          bindCredentials: _options.bindCredentials
        },
        oidc: {
          enabled: false,
          issuer: _options.oidcIssuer,
          clientId: _options.oidcClientId,
          clientSecret: _options.oidcClientSecret,
          redirectUri: _options.redirectUri
        }
      },
      session: {
        timeout: _options.sessionTimeout || 8 * 60 * 60 * 1000, // 8 hours
        renewalThreshold: _options.renewalThreshold || 30 * 60 * 1000, // 30 minutes
        maxConcurrentSessions: _options.maxConcurrentSessions || 5
      },
      security: {
        jwtSecret: _options.jwtSecret || crypto.randomBytes(64).toString('hex'),
        encryptionKey: _options.encryptionKey || crypto.randomBytes(32),
        tokenExpiry: _options.tokenExpiry || 3600, // 1 hour
        refreshTokenExpiry: _options.refreshTokenExpiry || 7 * 24 * 3600 // 7 days
      },
      ..._options
    };
    
    this.sessions = new Map();
    this.providers = new Map();
    this.userCache = new Map();
    
    this._initializeProviders();
  }

  /**
   * Initialize SSO providers
   */
  async _initializeProviders() {
    if (this._config.providers.saml.enabled) {
      this.providers.set('saml', new SAMLProvider(this._config.providers.saml));
    }
    
    if (this._config.providers.oauth2.enabled) {
      this.providers.set('oauth2', new OAuth2Provider(this._config.providers.oauth2));
    }
    
    if (this._config.providers.activeDirectory.enabled) {
      this.providers.set('ad', new ActiveDirectoryProvider(this._config.providers.activeDirectory));
    }
    
    if (this._config.providers.oidc.enabled) {
      this.providers.set('oidc', new OIDCProvider(this._config.providers.oidc));
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

    const state = crypto.randomUUID();
    const loginRequest = {
      tenantId,
      provider,
      state,
      _redirectUrl,
      timestamp: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    };

    // Store login request for callback validation
    this.sessions.set(state, loginRequest);

    const authUrl = await ssoProvider.getAuthorizationUrl(state, _redirectUrl);
    
    this.emit('login_initiated', { tenantId, provider, state });
    
    return {
      authUrl,
      state,
      expiresAt: loginRequest.expiresAt
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

    const loginRequest = this.sessions.get(_callbackData.state);
    if (!loginRequest) {
      throw new Error('Invalid or expired login request');
    }

    if (loginRequest.expiresAt < Date.now()) {
      this.sessions.delete(_callbackData.state);
      throw new Error('Login request expired');
    }

    // Exchange authorization code for tokens
    const tokenData = await ssoProvider.exchangeCodeForTokens(_callbackData);
    
    // Get user information
    const userInfo = await ssoProvider.getUserInfo(tokenData._accessToken);
    
    // Create internal user session
    const session = await this._createUserSession(
      loginRequest.tenantId,
      userInfo,
      provider,
      tokenData
    );

    // Clean up login request
    this.sessions.delete(_callbackData.state);

    this.emit('login_completed', { 
      tenantId: loginRequest.tenantId, 
      provider, 
      userId: userInfo.id,
      sessionId: session.id
    });

    return {
      session,
      user: userInfo,
      redirectUrl: loginRequest._redirectUrl
    };
  }

  /**
   * Create user session with JWT tokens
   */
  async _createUserSession(tenantId, userInfo, provider, tokenData) {
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    
    // Check concurrent session limits
    const userSessions = Array.from(this.sessions.values())
      .filter(s => s.userId === userInfo.id && s.tenantId === tenantId);
    
    if (userSessions.length >= this._config.session.maxConcurrentSessions) {
      // Remove oldest session
      const oldestSession = userSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
      this.sessions.delete(oldestSession.id);
      this.emit('session_evicted', { sessionId: oldestSession.id, reason: 'concurrent_limit' });
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
        attributes: userInfo.attributes || {}
      },
      tokens: {
        _accessToken: this._generateJWT({
          sub: userInfo.id,
          tenant: tenantId,
          provider,
          roles: userInfo.roles || [],
          exp: Math.floor(now / 1000) + this._config.security.tokenExpiry
        }),
        refreshToken: this._generateRefreshToken(),
        externalTokens: {
          accessToken: tokenData._accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt
        }
      },
      metadata: {
        createdAt: now,
        lastActivity: now,
        expiresAt: now + this._config.session.timeout,
        ipAddress: tokenData.ipAddress,
        userAgent: tokenData.userAgent
      }
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
    const renewalTime = session.metadata.expiresAt - this._config.session.renewalThreshold;
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
    const provider = this.providers.get(session.provider);
    if (!provider) {
      throw new Error(`Provider ${session.provider} not available`);
    }

    try {
      // Refresh external tokens if needed
      if (session.tokens.externalTokens.refreshToken) {
        const newTokens = await provider.refreshTokens(session.tokens.externalTokens.refreshToken);
        session.tokens.externalTokens = newTokens;
      }

      // Generate new internal tokens
      const now = Date.now();
      session.tokens.accessToken = this._generateJWT({
        sub: session.userId,
        tenant: session.tenantId,
        provider: session.provider,
        roles: session.user.roles,
        exp: Math.floor(now / 1000) + this._config.security.tokenExpiry
      });

      session.metadata.expiresAt = now + this._config.session.timeout;
      
      this.emit('session_renewed', { sessionId: session.id, tenantId: session.tenantId });
      
    } catch (error) {
      this.emit('session_renewal_failed', { 
        sessionId: session.id, 
        tenantId: session.tenantId, 
        error: error.message 
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
            error: error.message 
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
      provider: session.provider
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
      .filter(s => s.tenantId === tenantId)
      .map(s => ({
        id: s.id,
        userId: s.userId,
        provider: s.provider,
        user: _options.includeUserInfo ? s.user : { id: s.user.id, email: s.user.email },
        metadata: s.metadata
      }));

    return sessions;
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeUserSessions(tenantId, userId, excludeSessionId = null) {
    const userSessions = Array.from(this.sessions.entries())
      .filter(([sessionId, session]) => 
        session.tenantId === tenantId && 
        session.userId === userId &&
        sessionId !== excludeSessionId
      );

    for (const [sessionId] of userSessions) {
      this.sessions.delete(sessionId);
      this.emit('session_revoked', { sessionId, tenantId, userId, reason: 'admin_revoke' });
    }

    return { revokedSessions: userSessions.length };
  }

  /**
   * Generate JWT token using secure jsonwebtoken library
   * @param {object} payload - JWT payload
   * @returns {string} Signed JWT token
   */
  _generateJWT(payload) {
    // Security fix: Use proper JWT library with signature verification
    try {
      return jwt.sign(payload, this._config.security.jwtSecret, {
        algorithm: 'HS256',
        issuer: 'rag-pipeline-utils',
        audience: 'rag-pipeline-api',
        jwtid: crypto.randomUUID(),
        notBefore: 0
      });
    } catch (error) {
      throw new Error(`JWT generation failed: ${error.message}`);
    }
  }

  /**
   * Verify and decode JWT token
   * @param {string} token - JWT token to verify
   * @returns {object} Decoded payload
   */
  _verifyJWT(token) {
    try {
      return jwt.verify(token, this._config.security.jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'rag-pipeline-utils',
        audience: 'rag-pipeline-api',
        clockTolerance: 30 // 30 seconds tolerance for clock skew
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('JWT token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid JWT token');
      } else if (error.name === 'NotBeforeError') {
        throw new Error('JWT token not yet valid');
      }
      throw new Error(`JWT verification failed: ${error.message}`);
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
}

// SSO Provider implementations
class SAMLProvider {
  constructor(_config) {
    this._config = _config;
  }

  async getAuthorizationUrl(state, _redirectUrl) {
    // SAML SSO URL construction
    const params = new URLSearchParams({
      SAMLRequest: this._buildSAMLRequest(state),
      RelayState: state
    });
    
    return `${this._config.ssoUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(_callbackData) {
    // SAML assertion processing
    const assertion = this._validateSAMLResponse(_callbackData.SAMLResponse);
    
    return {
      _accessToken: assertion.sessionIndex,
      refreshToken: null,
      expiresAt: assertion.notOnOrAfter
    };
  }

  async getUserInfo(_accessToken) {
    // Extract user info from SAML assertion
    return {
      id: _accessToken.nameID,
      email: _accessToken.attributes.email,
      name: _accessToken.attributes.displayName,
      roles: _accessToken.attributes.roles || [],
      groups: _accessToken.attributes.groups || []
    };
  }

  _buildSAMLRequest(state) {
    // Mock SAML request - in production, use proper SAML library
    return Buffer.from(`<samlp:AuthnRequest ID="${state}"></samlp:AuthnRequest>`).toString('base64');
  }

  _validateSAMLResponse(_response) {
    // Mock SAML _response validation
    return {
      sessionIndex: crypto.randomUUID(),
      nameID: 'user@example.com',
      attributes: {
        email: 'user@example.com',
        displayName: 'Test User',
        roles: ['user']
      },
      notOnOrAfter: Date.now() + (8 * 60 * 60 * 1000)
    };
  }
}

class OAuth2Provider {
  constructor(_config) {
    this._config = _config;
  }

  async getAuthorizationUrl(state, _redirectUrl) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this._config.clientId,
      redirect_uri: _redirectUrl,
      scope: this._config.scopes.join(' '),
      state
    });
    
    return `${this._config.authorizationUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(_callbackData) {
    // Mock OAuth2 token exchange
    return {
      _accessToken: crypto.randomBytes(32).toString('hex'),
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresAt: Date.now() + (3600 * 1000)
    };
  }

  async getUserInfo(_accessToken) {
    // Mock user info retrieval
    return {
      id: crypto.randomUUID(),
      email: 'user@example.com',
      name: 'OAuth User',
      roles: ['user']
    };
  }

  async refreshTokens(refreshToken) {
    // Mock token refresh
    return {
      _accessToken: crypto.randomBytes(32).toString('hex'),
      refreshToken: refreshToken,
      expiresAt: Date.now() + (3600 * 1000)
    };
  }
}

class ActiveDirectoryProvider {
  constructor(_config) {
    this._config = _config;
  }

  async getAuthorizationUrl(state, _redirectUrl) {
    // AD FS OAuth2 flow
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'rag-pipeline-utils',
      resource: this._config.url,
      redirect_uri: _redirectUrl,
      state
    });
    
    return `${this._config.url}/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(_callbackData) {
    // Mock AD token exchange
    return {
      _accessToken: crypto.randomBytes(32).toString('hex'),
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresAt: Date.now() + (3600 * 1000)
    };
  }

  async getUserInfo(_accessToken) {
    // Mock AD user lookup
    return {
      id: crypto.randomUUID(),
      email: 'user@corp.com',
      name: 'AD User',
      roles: ['user'],
      groups: ['Domain Users']
    };
  }
}

class OIDCProvider {
  constructor(_config) {
    this._config = _config;
  }

  async getAuthorizationUrl(state, _redirectUrl) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this._config.clientId,
      redirect_uri: _redirectUrl,
      scope: 'openid profile email',
      state
    });
    
    return `${this._config.issuer}/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(_callbackData) {
    // Mock OIDC token exchange
    return {
      _accessToken: crypto.randomBytes(32).toString('hex'),
      refreshToken: crypto.randomBytes(32).toString('hex'),
      idToken: this._generateMockIdToken(),
      expiresAt: Date.now() + (3600 * 1000)
    };
  }

  async getUserInfo(_accessToken) {
    // Mock OIDC userinfo
    return {
      id: crypto.randomUUID(),
      email: 'user@oidc.com',
      name: 'OIDC User',
      roles: ['user']
    };
  }

  _generateMockIdToken() {
    // Mock ID token
    return 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.mock.token';
  }
}

module.exports = {
  SSOManager,
  SAMLProvider,
  OAuth2Provider,
  ActiveDirectoryProvider,
  OIDCProvider
};


// Ensure module.exports is properly defined
