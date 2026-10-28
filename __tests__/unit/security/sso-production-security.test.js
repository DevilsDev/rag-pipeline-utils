/**
 * @fileoverview Unit tests for SSO security (experimental module).
 *
 * 2.5.0: the development bypass (any code accepted, fixed dev identity) is
 * off by default everywhere and only active with devBypass: true outside
 * production; OAuth2/OIDC use PKCE; OIDC id_tokens are validated; SAML
 * refuses to authenticate. All keys are generated locally; no network.
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const {
  SSOManager,
  SAMLProvider,
  OAuth2Provider,
  ActiveDirectoryProvider,
  OIDCProvider,
} = require("../../../src/enterprise/sso-integration.js");
const { logger } = require("../../../src/utils/logger");

const SAML_REFUSAL = "SAML authentication is not supported";

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    json: () => Promise.resolve(body),
  };
}

function bodyOf(call) {
  return new URLSearchParams(call[1].body.toString());
}

// ---------------------------------------------------------------------------
// OIDC fixtures: locally generated RSA keys and a configured JWKS
// ---------------------------------------------------------------------------
const ISSUER = "https://idp.example.com";
const CLIENT_ID = "client-123";
const REDIRECT_URI = "https://app.example.com/sso/callback";
const { privateKey: rsaPrivate, publicKey: rsaPublic } =
  crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: otherPrivate } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const JWKS = {
  keys: [{ ...rsaPublic.export({ format: "jwk" }), kid: "k1", use: "sig" }],
};

function oidcConfig(extra = {}) {
  return {
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: "secret",
    redirectUri: REDIRECT_URI,
    authorizationUrl: `${ISSUER}/authorize`,
    tokenUrl: `${ISSUER}/token`,
    userInfoUrl: `${ISSUER}/userinfo`,
    jwks: JWKS,
    ...extra,
  };
}

function idToken(claims = {}, options = {}) {
  return jwt.sign(
    {
      sub: "user-456",
      email: "oidc@example.com",
      nonce: "n-1",
      ...claims,
    },
    options.key || rsaPrivate,
    {
      algorithm: options.algorithm || "RS256",
      keyid: options.kid === undefined ? "k1" : options.kid,
      issuer: options.issuer || ISSUER,
      audience: options.audience || CLIENT_ID,
      expiresIn: options.expiresIn === undefined ? 300 : options.expiresIn,
    },
  );
}

describe("SSO security", () => {
  let originalEnv;
  let originalFetch;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    originalFetch = global.fetch;
    jest.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("Production environment", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    test("devBypass is refused in production", () => {
      for (const Provider of [
        SAMLProvider,
        OAuth2Provider,
        ActiveDirectoryProvider,
        OIDCProvider,
      ]) {
        expect(() => new Provider({ devBypass: true })).toThrow(
          "devBypass must not be enabled when NODE_ENV=production",
        );
      }
      expect(() => new SSOManager({ devBypass: true })).toThrow(
        "devBypass must not be enabled when NODE_ENV=production",
      );
    });

    test("SAMLProvider refuses to authenticate", async () => {
      const saml = new SAMLProvider({ ssoUrl: "https://sso.example.com" });
      expect(() => saml._buildSAMLRequest("s")).toThrow(SAML_REFUSAL);
      expect(() => saml._validateSAMLResponse("x")).toThrow(SAML_REFUSAL);
      await expect(saml.getAuthorizationUrl("s")).rejects.toThrow(SAML_REFUSAL);
      await expect(
        saml.exchangeCodeForTokens({ SAMLResponse: "x" }),
      ).rejects.toThrow(SAML_REFUSAL);
    });

    describe("OAuth2Provider", () => {
      let oauth2Provider;

      beforeEach(() => {
        oauth2Provider = new OAuth2Provider({
          clientId: "test-client",
          clientSecret: "test-secret",
          authorizationUrl: "https://auth.example.com/oauth/authorize",
          tokenUrl: "https://auth.example.com/oauth/token",
          userInfoUrl: "https://auth.example.com/oauth/userinfo",
          redirectUri: REDIRECT_URI,
        });
      });

      test("uses the real OAuth2 flow with PKCE and the configured redirect_uri", async () => {
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce(
            jsonResponse({
              access_token: "real-token",
              refresh_token: "real-refresh",
              expires_in: 3600,
              token_type: "Bearer",
            }),
          )
          .mockResolvedValueOnce(
            jsonResponse({
              id: "user-123",
              email: "user@example.com",
              name: "Real User",
            }),
          );

        const tokens = await oauth2Provider.exchangeCodeForTokens(
          {
            code: "auth-code",
            redirect_uri: "https://evil.example.com/steal",
          },
          { codeVerifier: "verifier-abc" },
        );

        expect(tokens._accessToken).toBe("real-token");
        expect(tokens.tokenType).toBe("Bearer");
        const body = bodyOf(global.fetch.mock.calls[0]);
        expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
        expect(body.get("code_verifier")).toBe("verifier-abc");

        const userInfo = await oauth2Provider.getUserInfo(tokens._accessToken);
        expect(userInfo.id).toBe("user-123");
      });

      test("requires the PKCE verifier", async () => {
        global.fetch = jest.fn();
        await expect(
          oauth2Provider.exchangeCodeForTokens({ code: "auth-code" }),
        ).rejects.toThrow("PKCE code_verifier missing");
        expect(global.fetch).not.toHaveBeenCalled();
      });

      test("handles token exchange errors", async () => {
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce(jsonResponse({}, false, 400));

        await expect(
          oauth2Provider.exchangeCodeForTokens(
            { code: "invalid-code" },
            { codeVerifier: "v" },
          ),
        ).rejects.toThrow(
          "OAuth2 token exchange failed: Token exchange failed: 400 Bad Request",
        );
      });

      test("handles user info errors", async () => {
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce(jsonResponse({}, false, 401));

        await expect(
          oauth2Provider.getUserInfo("invalid-token"),
        ).rejects.toThrow(
          "Failed to get user info: User info request failed: 401",
        );
      });
    });

    test("ActiveDirectoryProvider requires a real integration", async () => {
      const adProvider = new ActiveDirectoryProvider({
        url: "https://adfs.corp.com",
      });
      await expect(
        adProvider.exchangeCodeForTokens({ code: "test-code" }),
      ).rejects.toThrow(
        "Production Active Directory integration required - please configure AD FS or Azure AD",
      );
      await expect(adProvider.getUserInfo("test-token")).rejects.toThrow(
        "Production Active Directory user lookup required - please configure AD integration",
      );
    });

    test("OIDC flow validates the id_token and checks userinfo sub", async () => {
      const oidc = new OIDCProvider(oidcConfig());
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: "oidc-token",
            refresh_token: "oidc-refresh",
            id_token: idToken(),
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ sub: "user-456", email: "oidc@example.com" }),
        );

      const tokens = await oidc.exchangeCodeForTokens(
        { code: "oidc-code", redirect_uri: "https://evil.example.com" },
        { codeVerifier: "v", nonce: "n-1" },
      );
      expect(tokens.claims.sub).toBe("user-456");
      expect(bodyOf(global.fetch.mock.calls[0]).get("redirect_uri")).toBe(
        REDIRECT_URI,
      );

      const userInfo = await oidc.getUserInfo(tokens._accessToken, tokens);
      expect(userInfo.id).toBe("user-456");
    });

    test("OIDC rejects a userinfo response for a different subject", async () => {
      const oidc = new OIDCProvider(oidcConfig());
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse({ sub: "someone-else" }));
      await expect(
        oidc.getUserInfo("t", { claims: { sub: "user-456" } }),
      ).rejects.toThrow("userinfo sub does not match");
    });

    test("blocks mock ID token generation", () => {
      const oidc = new OIDCProvider(oidcConfig());
      expect(() => oidc._generateMockIdToken()).toThrow(
        "Mock ID token generation not allowed in production",
      );
    });
  });

  describe("Development without devBypass (default)", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
      global.fetch = jest.fn().mockRejectedValue(new Error("network blocked"));
    });

    test("OAuth2 does not accept arbitrary codes", async () => {
      const p = new OAuth2Provider({ clientId: "c", clientSecret: "s" });
      await expect(
        p.exchangeCodeForTokens({ code: "dev-code" }),
      ).rejects.toThrow("redirectUri must be configured");
      await expect(p.getUserInfo("x")).rejects.toThrow(
        "Failed to get user info",
      );
    });

    test("OIDC does not accept arbitrary codes", async () => {
      const p = new OIDCProvider(oidcConfig());
      await expect(
        p.exchangeCodeForTokens({ code: "dev-code" }),
      ).rejects.toThrow("PKCE code_verifier missing");
      await expect(p.getUserInfo("x")).rejects.toThrow(
        "OIDC getUserInfo failed",
      );
    });

    test("Active Directory and SAML refuse", async () => {
      const ad = new ActiveDirectoryProvider({});
      await expect(ad.exchangeCodeForTokens({ code: "c" })).rejects.toThrow(
        "Active Directory integration required",
      );
      const saml = new SAMLProvider({});
      expect(() =>
        saml._validateSAMLResponse(
          Buffer.from("<samlp:Response/>").toString("base64"),
        ),
      ).toThrow(SAML_REFUSAL);
    });

    test("callback data must be an object", async () => {
      const p = new OAuth2Provider({ clientId: "c" });
      await expect(p.exchangeCodeForTokens(null)).rejects.toThrow(
        "Callback data is required",
      );
    });
  });

  describe("Development with devBypass: true", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    test("logs a loud warning", () => {
      new OAuth2Provider({ clientId: "c", devBypass: true });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("devBypass is ENABLED"),
      );
    });

    test("SAML dev mock works and still checks the format", () => {
      const saml = new SAMLProvider({ entityId: "e", devBypass: true });
      expect(typeof saml._buildSAMLRequest("s")).toBe("string");
      const response = saml._validateSAMLResponse(
        Buffer.from("<samlp:Response></samlp:Response>").toString("base64"),
      );
      expect(response.nameID).toBe("dev-user@example.com");
      expect(() => saml._validateSAMLResponse("invalid-response")).toThrow(
        "Invalid SAML response format",
      );
      expect(() => saml._validateSAMLResponse(null)).toThrow(
        "SAML response is required",
      );
    });

    test("OAuth2 returns the dev identity", async () => {
      const p = new OAuth2Provider({ clientId: "c", devBypass: true });
      const tokens = await p.exchangeCodeForTokens({ code: "dev-code" });
      expect(tokens._accessToken).toBeDefined();
      const user = await p.getUserInfo(tokens._accessToken);
      expect(user.email).toBe("dev-oauth-user@example.com");
      await expect(p.exchangeCodeForTokens({})).rejects.toThrow(
        "Authorization code is required",
      );
    });

    test("AD and OIDC return dev identities", async () => {
      const ad = new ActiveDirectoryProvider({ devBypass: true });
      await ad.exchangeCodeForTokens({ code: "c" });
      expect((await ad.getUserInfo("t")).groups).toContain("Developers");

      const oidc = new OIDCProvider({ ...oidcConfig(), devBypass: true });
      const tokens = await oidc.exchangeCodeForTokens({ code: "c" });
      expect(tokens.idToken.split(".")).toHaveLength(3);
      expect((await oidc.getUserInfo("t")).email).toBe("dev-user@oidc.com");
    });

    test("bypass is ignored if NODE_ENV becomes production later", async () => {
      const p = new OAuth2Provider({ clientId: "c", devBypass: true });
      process.env.NODE_ENV = "production";
      await expect(
        p.exchangeCodeForTokens({ code: "dev-code" }),
      ).rejects.toThrow("redirectUri must be configured");
    });
  });

  describe("OIDC id_token validation", () => {
    let oidc;

    beforeEach(() => {
      process.env.NODE_ENV = "production";
      oidc = new OIDCProvider(oidcConfig());
      global.fetch = jest.fn().mockRejectedValue(new Error("no network"));
    });

    test("accepts a valid token", async () => {
      const claims = await oidc.validateIdToken(idToken(), { nonce: "n-1" });
      expect(claims.sub).toBe("user-456");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test.each([
      [
        "a bad signature",
        () => idToken({}, { key: otherPrivate }),
        /invalid signature/,
      ],
      [
        "a wrong issuer",
        () => idToken({}, { issuer: "https://evil" }),
        /issuer invalid/,
      ],
      [
        "a wrong audience",
        () => idToken({}, { audience: "other" }),
        /audience invalid/,
      ],
      ["an expired token", () => idToken({}, { expiresIn: -600 }), /expired/],
      ["a wrong nonce", () => idToken({ nonce: "other" }), /nonce invalid/],
      [
        "an unknown kid",
        () => idToken({}, { kid: "nope" }),
        /no signing key found/,
      ],
      [
        "an HMAC algorithm",
        () => idToken({}, { key: "x".repeat(64), algorithm: "HS256" }),
        /algorithm HS256 is not allowed/,
      ],
    ])("rejects %s", async (_label, make, message) => {
      await expect(
        oidc.validateIdToken(make(), { nonce: "n-1" }),
      ).rejects.toThrow(message);
    });

    test("requires an expected nonce", async () => {
      await expect(oidc.validateIdToken(idToken(), {})).rejects.toThrow(
        "expected nonce is required",
      );
    });

    test("uses discovery + jwks_uri when not configured", async () => {
      const discovered = new OIDCProvider({
        issuer: ISSUER,
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
      });
      global.fetch = jest.fn((url) => {
        if (url.endsWith("/.well-known/openid-configuration")) {
          return Promise.resolve(
            jsonResponse({
              issuer: ISSUER,
              authorization_endpoint: `${ISSUER}/authorize`,
              token_endpoint: `${ISSUER}/token`,
              jwks_uri: `${ISSUER}/jwks`,
            }),
          );
        }
        if (url === `${ISSUER}/jwks`)
          return Promise.resolve(jsonResponse(JWKS));
        return Promise.reject(new Error(`unexpected ${url}`));
      });

      const claims = await discovered.validateIdToken(idToken(), {
        nonce: "n-1",
      });
      expect(claims.sub).toBe("user-456");
    });

    test("rejects discovery metadata for another issuer", async () => {
      const discovered = new OIDCProvider({
        issuer: ISSUER,
        clientId: CLIENT_ID,
      });
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ issuer: "https://evil.example.com" }),
        );
      await expect(discovered.getMetadata()).rejects.toThrow(
        "OIDC discovery issuer mismatch",
      );
    });
  });

  describe("SSOManager", () => {
    let manager;

    function oauthManager(extra = {}) {
      return new SSOManager({
        providers: {
          saml: { enabled: false },
          oauth2: {
            enabled: true,
            clientId: "c",
            clientSecret: "s",
            authorizationUrl: "https://auth.example.com/authorize",
            tokenUrl: "https://auth.example.com/token",
            userInfoUrl: "https://auth.example.com/userinfo",
            redirectUri: REDIRECT_URI,
            scopes: ["openid"],
          },
          activeDirectory: { enabled: false },
          oidc: { enabled: true, ...oidcConfig() },
        },
        ...extra,
      });
    }

    afterEach(() => {
      if (manager) manager.destroy();
      manager = null;
    });

    test("initializes providers based on configuration", async () => {
      process.env.NODE_ENV = "development";
      manager = new SSOManager({
        providers: {
          saml: { enabled: true, entityId: "test" },
          oauth2: { enabled: true, clientId: "test", clientSecret: "secret" },
          activeDirectory: { enabled: false },
          oidc: { enabled: true, issuer: ISSUER, clientId: "test" },
        },
      });
      await manager._initializeProviders();
      expect(manager.providers.has("saml")).toBe(true);
      expect(manager.providers.has("oauth2")).toBe(true);
      expect(manager.providers.has("ad")).toBe(false);
      expect(manager.providers.has("oidc")).toBe(true);
    });

    test("handles unknown providers", async () => {
      manager = new SSOManager();
      await expect(
        manager.initiateLogin("tenant1", "nonexistent", "https://app.com"),
      ).rejects.toThrow("SSO provider nonexistent not configured");
    });

    test("authorization URL carries PKCE S256 and the configured redirect_uri", async () => {
      manager = oauthManager();
      const { authUrl, state } = await manager.initiateLogin(
        "t1",
        "oauth2",
        "https://app.example.com/after-login",
      );
      const params = new URL(authUrl).searchParams;
      const stored = manager.sessions.get(state);

      expect(params.get("code_challenge_method")).toBe("S256");
      expect(params.get("code_challenge")).toBe(
        crypto
          .createHash("sha256")
          .update(stored.codeVerifier)
          .digest("base64url"),
      );
      expect(params.get("redirect_uri")).toBe(REDIRECT_URI);
      expect(authUrl).not.toContain(stored.codeVerifier);
    });

    test("OIDC authorization URL carries a nonce", async () => {
      manager = oauthManager();
      const { authUrl, state } = await manager.initiateLogin("t1", "oidc", "/");
      const params = new URL(authUrl).searchParams;
      expect(params.get("nonce")).toBe(manager.sessions.get(state).nonce);
      expect(params.get("code_challenge_method")).toBe("S256");
    });

    test("bypass is off by default: an arbitrary code yields no session", async () => {
      process.env.NODE_ENV = "development";
      manager = oauthManager();
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: "invalid_grant" }, false, 400),
        );
      const { state } = await manager.initiateLogin("t1", "oauth2", "/");

      await expect(
        manager.handleCallback("oauth2", { code: "anything", state }),
      ).rejects.toThrow("OAuth2 token exchange failed");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("devBypass: true issues a dev session outside production", async () => {
      process.env.NODE_ENV = "development";
      manager = oauthManager({ devBypass: true });
      const { state } = await manager.initiateLogin("t1", "oauth2", "/next");
      const result = await manager.handleCallback("oauth2", {
        code: "anything",
        state,
      });
      expect(result.user.email).toBe("dev-oauth-user@example.com");
      expect(result.redirectUrl).toBe("/next");
    });

    test("token exchange uses the stored verifier and ignores callback redirect_uri", async () => {
      manager = oauthManager();
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ access_token: "a", expires_in: 60 }),
        )
        .mockResolvedValueOnce(jsonResponse({ id: "u1", email: "u@x" }));
      const { state } = await manager.initiateLogin("t1", "oauth2", "/");
      const verifier = manager.sessions.get(state).codeVerifier;

      const result = await manager.handleCallback("oauth2", {
        code: "real-code",
        state,
        redirect_uri: "https://evil.example.com/steal",
      });

      const body = bodyOf(global.fetch.mock.calls[0]);
      expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
      expect(body.get("code_verifier")).toBe(verifier);
      expect(result.user.id).toBe("u1");
    });

    test("rejects a callback for a different provider than the login request", async () => {
      manager = oauthManager();
      global.fetch = jest.fn();
      const { state } = await manager.initiateLogin("t1", "oauth2", "/");

      await expect(
        manager.handleCallback("oidc", { code: "c", state }),
      ).rejects.toThrow("Login request provider mismatch");
      expect(global.fetch).not.toHaveBeenCalled();
      // The state was consumed
      await expect(
        manager.handleCallback("oauth2", { code: "c", state }),
      ).rejects.toThrow("Invalid or expired login request");
    });

    test("a state cannot be reused after a failed exchange", async () => {
      manager = oauthManager();
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, false, 400));
      const { state } = await manager.initiateLogin("t1", "oauth2", "/");
      await expect(
        manager.handleCallback("oauth2", { code: "c", state }),
      ).rejects.toThrow();
      await expect(
        manager.handleCallback("oauth2", { code: "c", state }),
      ).rejects.toThrow("Invalid or expired login request");
    });
  });
});
