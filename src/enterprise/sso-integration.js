/**
 * Enterprise SSO Integration
 * SAML 2.0, OAuth2, Active Directory, and identity provider support
 */

<<<<<<< HEAD
const _fs = require('_fs').promises; // eslint-disable-line global-require
const _path = require('_path'); // eslint-disable-line global-require
const crypto = require('crypto'); // eslint-disable-line global-require
const { EventEmitter } = require('events'); // eslint-disable-line global-require
const jwt = require('jsonwebtoken'); // eslint-disable-line global-require
=======
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
// eslint-disable-line global-require
const { EventEmitter } = require('events');
// eslint-disable-line global-require
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3

class SSOManager extends EventEmitter {
  constructor(_options = {}) {
    super();
<<<<<<< HEAD
    
=======

>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    this._config = {
      providers: {
        saml: {
          enabled: false,
          entityId: _options.entityId || 'rag-pipeline-utils',
          ssoUrl: _options.ssoUrl,
          sloUrl: _options.sloUrl,
          certificate: _options.certificate,
<<<<<<< HEAD
          privateKey: _options.privateKey
=======
          privateKey: _options.privateKey,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
        },
        oauth2: {
          enabled: false,
          clientId: _options.clientId,
          clientSecret: _options.clientSecret,
          authorizationUrl: _options.authorizationUrl,
          tokenUrl: _options.tokenUrl,
          userInfoUrl: _options.userInfoUrl,
<<<<<<< HEAD
          scopes: ['openid', 'profile', 'email']
=======
          scopes: ['openid', 'profile', 'email'],
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
        },
        activeDirectory: {
          enabled: false,
          domain: _options.adDomain,
          url: _options.adUrl,
          baseDN: _options.baseDN,
          bindDN: _options.bindDN,
<<<<<<< HEAD
          bindCredentials: _options.bindCredentials
=======
          bindCredentials: _options.bindCredentials,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
        },
        oidc: {
          enabled: false,
          issuer: _options.oidcIssuer,
          clientId: _options.oidcClientId,
          clientSecret: _options.oidcClientSecret,
<<<<<<< HEAD
          redirectUri: _options.redirectUri
        }
=======
          redirectUri: _options.redirectUri,
        },
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
      },
      session: {
        timeout: _options.sessionTimeout || 8 * 60 * 60 * 1000, // 8 hours
        renewalThreshold: _options.renewalThreshold || 30 * 60 * 1000, // 30 minutes
<<<<<<< HEAD
        maxConcurrentSessions: _options.maxConcurrentSessions || 5
=======
        maxConcurrentSessions: _options.maxConcurrentSessions || 5,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
      },
      security: {
        jwtSecret: _options.jwtSecret || crypto.randomBytes(64).toString('hex'),
        encryptionKey: _options.encryptionKey || crypto.randomBytes(32),
        tokenExpiry: _options.tokenExpiry || 3600, // 1 hour
<<<<<<< HEAD
        refreshTokenExpiry: _options.refreshTokenExpiry || 7 * 24 * 3600 // 7 days
      },
      ..._options
    };
    
    this.sessions = new Map();
    this.providers = new Map();
    this.userCache = new Map();
    
=======
        refreshTokenExpiry: _options.refreshTokenExpiry || 7 * 24 * 3600, // 7 days
      },
      ..._options,
    };

    this.sessions = new Map();
    this.providers = new Map();
    this.userCache = new Map();

>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    this._initializeProviders();
  }

  /**
   * Initialize SSO providers
   */
  async _initializeProviders() {
    if (this._config.providers.saml.enabled) {
      this.providers.set('saml', new SAMLProvider(this._config.providers.saml));
    }
<<<<<<< HEAD
    
    if (this._config.providers.oauth2.enabled) {
      this.providers.set('oauth2', new OAuth2Provider(this._config.providers.oauth2));
    }
    
    if (this._config.providers.activeDirectory.enabled) {
      this.providers.set('ad', new ActiveDirectoryProvider(this._config.providers.activeDirectory));
    }
    
=======

    if (this._config.providers.oauth2.enabled) {
      this.providers.set(
        'oauth2',
        new OAuth2Provider(this._config.providers.oauth2),
      );
    }

    if (this._config.providers.activeDirectory.enabled) {
      this.providers.set(
        'ad',
        new ActiveDirectoryProvider(this._config.providers.activeDirectory),
      );
    }

>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
=======
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    };

    // Store login request for callback validation
    this.sessions.set(state, loginRequest);

    const authUrl = await ssoProvider.getAuthorizationUrl(state, _redirectUrl);
<<<<<<< HEAD
    
    this.emit('login_initiated', { tenantId, provider, state });
    
    return {
      authUrl,
      state,
      expiresAt: loginRequest.expiresAt
=======

    this.emit('login_initiated', { tenantId, provider, state });

    return {
      authUrl,
      state,
      expiresAt: loginRequest.expiresAt,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
    
    // Get user information
    const userInfo = await ssoProvider.getUserInfo(tokenData._accessToken);
    
=======

    // Get user information
    const userInfo = await ssoProvider.getUserInfo(tokenData._accessToken);

>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    // Create internal user session
    const session = await this._createUserSession(
      loginRequest.tenantId,
      userInfo,
      provider,
<<<<<<< HEAD
      tokenData
=======
      tokenData,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    );

    // Clean up login request
    this.sessions.delete(_callbackData.state);

<<<<<<< HEAD
    this.emit('login_completed', { 
      tenantId: loginRequest.tenantId, 
      provider, 
      userId: userInfo.id,
      sessionId: session.id
=======
    this.emit('login_completed', {
      tenantId: loginRequest.tenantId,
      provider,
      userId: userInfo.id,
      sessionId: session.id,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    });

    return {
      session,
      user: userInfo,
<<<<<<< HEAD
      redirectUrl: loginRequest._redirectUrl
=======
      redirectUrl: loginRequest._redirectUrl,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    };
  }

  /**
   * Create user session with JWT tokens
   */
  async _createUserSession(tenantId, userInfo, provider, tokenData) {
    const sessionId = crypto.randomUUID();
    const now = Date.now();
<<<<<<< HEAD
    
    // Check concurrent session limits
    const userSessions = Array.from(this.sessions.values())
      .filter(s => s.userId === userInfo.id && s.tenantId === tenantId);
    
    if (userSessions.length >= this._config.session.maxConcurrentSessions) {
      // Remove oldest session
      const oldestSession = userSessions.sort((a, b) => a.createdAt - b.createdAt)[0];
      this.sessions.delete(oldestSession.id);
      this.emit('session_evicted', { sessionId: oldestSession.id, reason: 'concurrent_limit' });
=======

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
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
        attributes: userInfo.attributes || {}
=======
        attributes: userInfo.attributes || {},
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
      },
      tokens: {
        _accessToken: this._generateJWT({
          sub: userInfo.id,
          tenant: tenantId,
          provider,
          roles: userInfo.roles || [],
<<<<<<< HEAD
          exp: Math.floor(now / 1000) + this._config.security.tokenExpiry
=======
          exp: Math.floor(now / 1000) + this._config.security.tokenExpiry,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
        }),
        refreshToken: this._generateRefreshToken(),
        externalTokens: {
          accessToken: tokenData._accessToken,
          refreshToken: tokenData.refreshToken,
<<<<<<< HEAD
          expiresAt: tokenData.expiresAt
        }
=======
          expiresAt: tokenData.expiresAt,
        },
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
      },
      metadata: {
        createdAt: now,
        lastActivity: now,
        expiresAt: now + this._config.session.timeout,
        ipAddress: tokenData.ipAddress,
<<<<<<< HEAD
        userAgent: tokenData.userAgent
      }
=======
        userAgent: tokenData.userAgent,
      },
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
    
=======

>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    // Check if session expired
    if (session.metadata.expiresAt < now) {
      this.sessions.delete(sessionId);
      this.emit('session_expired', { sessionId, tenantId });
      throw new Error('Session expired');
    }

    // Check if session needs renewal
<<<<<<< HEAD
    const renewalTime = session.metadata.expiresAt - this._config.session.renewalThreshold;
=======
    const renewalTime =
      session.metadata.expiresAt - this._config.session.renewalThreshold;
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
    const provider = this.providers.get(session.provider);
    if (!provider) {
=======
    const _provider = this.providers.get(session.provider);
    if (!_provider) {
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
      throw new Error(`Provider ${session.provider} not available`);
    }

    try {
      // Refresh external tokens if needed
      if (session.tokens.externalTokens.refreshToken) {
<<<<<<< HEAD
        const newTokens = await provider.refreshTokens(session.tokens.externalTokens.refreshToken);
=======
        const newTokens = await _provider.refreshTokens(
          session.tokens.externalTokens.refreshToken,
        );
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
        session.tokens.externalTokens = newTokens;
      }

      // Generate new internal tokens
      const now = Date.now();
      session.tokens.accessToken = this._generateJWT({
        sub: session.userId,
        tenant: session.tenantId,
        provider: session.provider,
        roles: session.user.roles,
<<<<<<< HEAD
        exp: Math.floor(now / 1000) + this._config.security.tokenExpiry
      });

      session.metadata.expiresAt = now + this._config.session.timeout;
      
      this.emit('session_renewed', { sessionId: session.id, tenantId: session.tenantId });
      
    } catch (error) {
      this.emit('session_renewal_failed', { 
        sessionId: session.id, 
        tenantId: session.tenantId, 
        error: error.message 
=======
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
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
          this.emit('sso_logout_failed', { 
            sessionId, 
            tenantId, 
            provider: session.provider, 
            error: error.message 
=======
          this.emit('sso_logout_failed', {
            sessionId,
            tenantId,
            provider: session.provider,
            error: error.message,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
          });
        }
      }
    }

    // Remove session
    this.sessions.delete(sessionId);
<<<<<<< HEAD
    
    this.emit('logout_completed', { 
      sessionId, 
      tenantId, 
      userId: session.userId,
      provider: session.provider
=======

    this.emit('logout_completed', {
      sessionId,
      tenantId,
      userId: session.userId,
      provider: session.provider,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
      .filter(s => s.tenantId === tenantId)
      .map(s => ({
        id: s.id,
        userId: s.userId,
        provider: s.provider,
        user: _options.includeUserInfo ? s.user : { id: s.user.id, email: s.user.email },
        metadata: s.metadata
=======
      .filter((s) => s.tenantId === tenantId)
      .map((s) => ({
        id: s.id,
        userId: s.userId,
        provider: s.provider,
        user: _options.includeUserInfo
          ? s.user
          : { id: s.user.id, email: s.user.email },
        metadata: s.metadata,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
      }));

    return sessions;
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeUserSessions(tenantId, userId, excludeSessionId = null) {
<<<<<<< HEAD
    const userSessions = Array.from(this.sessions.entries())
      .filter(([sessionId, session]) => 
        session.tenantId === tenantId && 
        session.userId === userId &&
        sessionId !== excludeSessionId
      );

    for (const [sessionId] of userSessions) {
      this.sessions.delete(sessionId);
      this.emit('session_revoked', { sessionId, tenantId, userId, reason: 'admin_revoke' });
=======
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
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    }

    return { revokedSessions: userSessions.length };
  }

  /**
<<<<<<< HEAD
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
=======
   * Generate JWT token
   */
  _generateJWT(payload) {
    // Simple JWT implementation - in production, use a proper JWT library
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = crypto
      .createHmac('sha256', this._config.security.jwtSecret)
      .update(`${header}.${payloadStr}`)
      .digest('base64url');

    return `${header}.${payloadStr}.${signature}`;
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
      RelayState: state
    });
    
=======
      RelayState: state,
    });

>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    return `${this._config.ssoUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(_callbackData) {
    // SAML assertion processing
    const assertion = this._validateSAMLResponse(_callbackData.SAMLResponse);
<<<<<<< HEAD
    
    return {
      _accessToken: assertion.sessionIndex,
      refreshToken: null,
      expiresAt: assertion.notOnOrAfter
=======

    return {
      _accessToken: assertion.sessionIndex,
      refreshToken: null,
      expiresAt: assertion.notOnOrAfter,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    };
  }

  async getUserInfo(_accessToken) {
    // Extract user info from SAML assertion
    return {
      id: _accessToken.nameID,
      email: _accessToken.attributes.email,
      name: _accessToken.attributes.displayName,
      roles: _accessToken.attributes.roles || [],
<<<<<<< HEAD
      groups: _accessToken.attributes.groups || []
=======
      groups: _accessToken.attributes.groups || [],
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    };
  }

  _buildSAMLRequest(state) {
<<<<<<< HEAD
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
=======
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Production SAML implementation required - please configure SAML library',
      );
    }

    // Development only - remove in production
    return Buffer.from(
      `<samlp:AuthnRequest ID="${state}" Version="2.0" IssueInstant="${new Date().toISOString()}" xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
        <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${this._config.entityId}</saml:Issuer>
        <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress" AllowCreate="true"/>
      </samlp:AuthnRequest>`,
    ).toString('base64');
  }

  _validateSAMLResponse(response) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Production SAML validation required - please configure SAML library',
      );
    }

    if (!response) {
      throw new Error('SAML response is required');
    }

    // Development only - implement proper SAML validation in production
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
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
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
=======
      state,
    });

    return `${this._config.authorizationUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(callbackData) {
    if (process.env.NODE_ENV === 'production') {
      // Production implementation using real OAuth2 flow
      const tokenRequest = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this._config.clientId}:${this._config.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: callbackData.code,
          redirect_uri: callbackData.redirect_uri,
        }),
      };

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

    // Development only
    if (!callbackData.code) {
      throw new Error('Authorization code is required');
    }

    return {
      _accessToken: crypto.randomBytes(32).toString('hex'),
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresAt: Date.now() + 3600 * 1000,
    };
  }

  async getUserInfo(accessToken) {
    if (process.env.NODE_ENV === 'production') {
      // Production implementation
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

    // Development only
    return {
      id: 'dev-' + crypto.randomUUID(),
      email: 'dev-oauth-user@example.com',
      name: 'Development OAuth User',
      roles: ['user', 'dev'],
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    };
  }

  async refreshTokens(refreshToken) {
<<<<<<< HEAD
    // Mock token refresh
    return {
      _accessToken: crypto.randomBytes(32).toString('hex'),
      refreshToken: refreshToken,
      expiresAt: Date.now() + (3600 * 1000)
=======
    if (process.env.NODE_ENV === 'production') {
      // Production token refresh
      const refreshRequest = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this._config.clientId}:${this._config.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      };

      try {
        const response = await fetch(this._config.tokenUrl, refreshRequest);

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

    // Development only
    return {
      _accessToken: crypto.randomBytes(32).toString('hex'),
      refreshToken: refreshToken,
      expiresAt: Date.now() + 3600 * 1000,
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
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
=======
      state,
    });

    return `${this._config.url}/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(callbackData) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Production Active Directory integration required - please configure AD FS or Azure AD',
      );
    }

    // Development only
    if (!callbackData.code) {
      throw new Error('Authorization code is required');
    }

    return {
      _accessToken: crypto.randomBytes(32).toString('hex'),
      refreshToken: crypto.randomBytes(32).toString('hex'),
      expiresAt: Date.now() + 3600 * 1000,
    };
  }

  async getUserInfo(accessToken) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Production Active Directory user lookup required - please configure AD integration',
      );
    }

    // Development only
    return {
      id: 'dev-' + crypto.randomUUID(),
      email: 'dev-user@corp.com',
      name: 'Development AD User',
      roles: ['user', 'dev'],
      groups: ['Domain Users', 'Developers'],
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
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
<<<<<<< HEAD
      state
    });
    
    return `${this._config.issuer}/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(_callbackData) {
    // Mock OIDC token exchange
=======
      state,
    });

    return `${this._config.issuer}/auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(callbackData) {
    if (process.env.NODE_ENV === 'production') {
      // Production OIDC implementation
      const tokenRequest = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this._config.clientId}:${this._config.clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: callbackData.code,
          redirect_uri: callbackData.redirect_uri,
        }),
      };

      try {
        const response = await fetch(
          `${this._config.issuer}/token`,
          tokenRequest,
        );

        if (!response.ok) {
          throw new Error(`OIDC token exchange failed: ${response.status}`);
        }

        const tokenData = await response.json();

        return {
          _accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          idToken: tokenData.id_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
        };
      } catch (error) {
        throw new Error(`OIDC token exchange failed: ${error.message}`);
      }
    }

    // Development only
    if (!callbackData.code) {
      throw new Error('Authorization code is required');
    }

>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    return {
      _accessToken: crypto.randomBytes(32).toString('hex'),
      refreshToken: crypto.randomBytes(32).toString('hex'),
      idToken: this._generateMockIdToken(),
<<<<<<< HEAD
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
=======
      expiresAt: Date.now() + 3600 * 1000,
    };
  }

  async getUserInfo(accessToken) {
    if (process.env.NODE_ENV === 'production') {
      // Production OIDC userinfo
      try {
        const userResponse = await fetch(`${this._config.issuer}/userinfo`, {
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

        const userData = await userResponse.json();

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

    // Development only
    return {
      id: 'dev-' + crypto.randomUUID(),
      email: 'dev-user@oidc.com',
      name: 'Development OIDC User',
      roles: ['user', 'dev'],
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
    };
  }

  _generateMockIdToken() {
<<<<<<< HEAD
    // Mock ID token
    return 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.mock.token';
=======
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Mock ID token generation not allowed in production');
    }

    // Development only - basic JWT structure
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
>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
  }
}

module.exports = {
  SSOManager,
  SAMLProvider,
  OAuth2Provider,
  ActiveDirectoryProvider,
<<<<<<< HEAD
  OIDCProvider
};


=======
  OIDCProvider,
};

>>>>>>> ad469760cdd27eb2586b4882d2362ef74a320fe3
// Ensure module.exports is properly defined
