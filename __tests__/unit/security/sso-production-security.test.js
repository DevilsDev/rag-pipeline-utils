/**
 * @fileoverview Unit tests for SSO Production Security
 * Tests that mock SSO implementations are blocked in production
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const {
  SSOManager,
  SAMLProvider,
  OAuth2Provider,
  ActiveDirectoryProvider,
  OIDCProvider,
} = require("../../../src/enterprise/sso-integration.js");

describe("SSO Production Security", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("Production Environment Enforcement", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    describe("SAMLProvider", () => {
      let samlProvider;

      beforeEach(() => {
        samlProvider = new SAMLProvider({
          entityId: "test-entity",
          ssoUrl: "https://sso.example.com",
          certificate: "cert",
          privateKey: "key",
        });
      });

      test("should block mock SAML request generation in production", () => {
        expect(() => {
          samlProvider._buildSAMLRequest("test-state");
        }).toThrow(
          "Production SAML implementation required - please configure SAML library",
        );
      });

      test("should block mock SAML response validation in production", () => {
        expect(() => {
          samlProvider._validateSAMLResponse("mock-response");
        }).toThrow(
          "Production SAML validation required - please configure SAML library",
        );
      });
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
        });
      });

      test("should use real OAuth2 flow in production", async () => {
        // Mock fetch for production test
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: "real-token",
                refresh_token: "real-refresh",
                expires_in: 3600,
                token_type: "Bearer",
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                id: "user-123",
                email: "user@example.com",
                name: "Real User",
              }),
          });

        const tokens = await oauth2Provider.exchangeCodeForTokens({
          code: "auth-code",
          redirect_uri: "https://app.example.com/callback",
        });

        expect(tokens._accessToken).toBe("real-token");
        expect(tokens.refreshToken).toBe("real-refresh");
        expect(tokens.tokenType).toBe("Bearer");

        const userInfo = await oauth2Provider.getUserInfo(tokens._accessToken);

        expect(userInfo.id).toBe("user-123");
        expect(userInfo.email).toBe("user@example.com");
        expect(userInfo.name).toBe("Real User");

        global.fetch.mockRestore();
      });

      test("should handle OAuth2 token exchange errors in production", async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: "Bad Request",
        });

        await expect(
          oauth2Provider.exchangeCodeForTokens({
            code: "invalid-code",
            redirect_uri: "https://app.example.com/callback",
          }),
        ).rejects.toThrow(
          "OAuth2 token exchange failed: Token exchange failed: 400 Bad Request",
        );

        global.fetch.mockRestore();
      });

      test("should handle user info errors in production", async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        });

        await expect(
          oauth2Provider.getUserInfo("invalid-token"),
        ).rejects.toThrow(
          "Failed to get user info: User info request failed: 401",
        );

        global.fetch.mockRestore();
      });
    });

    describe("ActiveDirectoryProvider", () => {
      let adProvider;

      beforeEach(() => {
        adProvider = new ActiveDirectoryProvider({
          domain: "corp.com",
          url: "https://adfs.corp.com",
          baseDN: "dc=corp,dc=com",
        });
      });

      test("should require production AD implementation", async () => {
        await expect(
          adProvider.exchangeCodeForTokens({ code: "test-code" }),
        ).rejects.toThrow(
          "Production Active Directory integration required - please configure AD FS or Azure AD",
        );

        await expect(adProvider.getUserInfo("test-token")).rejects.toThrow(
          "Production Active Directory user lookup required - please configure AD integration",
        );
      });
    });

    describe("OIDCProvider", () => {
      let oidcProvider;

      beforeEach(() => {
        oidcProvider = new OIDCProvider({
          issuer: "https://oidc.example.com",
          clientId: "test-client",
          clientSecret: "test-secret",
        });
      });

      test("should use real OIDC flow in production", async () => {
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                access_token: "oidc-token",
                refresh_token: "oidc-refresh",
                id_token: "oidc-id-token",
                expires_in: 3600,
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                sub: "user-456",
                email: "oidc@example.com",
                name: "OIDC User",
                preferred_username: "oidcuser",
              }),
          });

        const tokens = await oidcProvider.exchangeCodeForTokens({
          code: "oidc-code",
          redirect_uri: "https://app.example.com/callback",
        });

        expect(tokens._accessToken).toBe("oidc-token");
        expect(tokens.idToken).toBe("oidc-id-token");

        const userInfo = await oidcProvider.getUserInfo(tokens._accessToken);

        expect(userInfo.id).toBe("user-456");
        expect(userInfo.email).toBe("oidc@example.com");

        global.fetch.mockRestore();
      });

      test("should block mock ID token generation in production", () => {
        expect(() => {
          oidcProvider._generateMockIdToken();
        }).toThrow("Mock ID token generation not allowed in production");
      });
    });
  });

  describe("Development Environment Behavior", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    describe("SAMLProvider", () => {
      let samlProvider;

      beforeEach(() => {
        samlProvider = new SAMLProvider({
          entityId: "test-entity",
          ssoUrl: "https://sso.example.com",
        });
      });

      test("should allow mock SAML in development", () => {
        const request = samlProvider._buildSAMLRequest("test-state");
        expect(request).toBeDefined();
        expect(typeof request).toBe("string");

        const response = samlProvider._validateSAMLResponse(
          Buffer.from("<samlp:Response></samlp:Response>").toString("base64"),
        );
        expect(response.nameID).toBe("dev-user@example.com");
        expect(response.attributes.displayName).toBe("Development User");
      });

      test("should require valid SAML response format", () => {
        expect(() => {
          samlProvider._validateSAMLResponse("invalid-response");
        }).toThrow("Invalid SAML response format");

        expect(() => {
          samlProvider._validateSAMLResponse(null);
        }).toThrow("SAML response is required");
      });
    });

    describe("OAuth2Provider", () => {
      let oauth2Provider;

      beforeEach(() => {
        oauth2Provider = new OAuth2Provider({
          clientId: "test-client",
          clientSecret: "test-secret",
        });
      });

      test("should use mock OAuth2 in development", async () => {
        const tokens = await oauth2Provider.exchangeCodeForTokens({
          code: "dev-code",
        });

        expect(tokens._accessToken).toBeDefined();
        expect(tokens.refreshToken).toBeDefined();

        const userInfo = await oauth2Provider.getUserInfo(tokens._accessToken);

        expect(userInfo.email).toBe("dev-oauth-user@example.com");
        expect(userInfo.roles).toContain("dev");
      });

      test("should require authorization code in development", async () => {
        await expect(oauth2Provider.exchangeCodeForTokens({})).rejects.toThrow(
          "Authorization code is required",
        );
      });
    });

    describe("ActiveDirectoryProvider", () => {
      let adProvider;

      beforeEach(() => {
        adProvider = new ActiveDirectoryProvider({
          domain: "corp.com",
        });
      });

      test("should use mock AD in development", async () => {
        const tokens = await adProvider.exchangeCodeForTokens({
          code: "dev-code",
        });

        expect(tokens._accessToken).toBeDefined();

        const userInfo = await adProvider.getUserInfo(tokens._accessToken);

        expect(userInfo.email).toBe("dev-user@corp.com");
        expect(userInfo.groups).toContain("Developers");
      });
    });

    describe("OIDCProvider", () => {
      let oidcProvider;

      beforeEach(() => {
        oidcProvider = new OIDCProvider({
          issuer: "https://dev-oidc.example.com",
          clientId: "dev-client",
        });
      });

      test("should use mock OIDC in development", async () => {
        const tokens = await oidcProvider.exchangeCodeForTokens({
          code: "dev-code",
        });

        expect(tokens.idToken).toBeDefined();

        const userInfo = await oidcProvider.getUserInfo(tokens._accessToken);

        expect(userInfo.email).toBe("dev-user@oidc.com");
        expect(userInfo.roles).toContain("dev");
      });

      test("should generate valid mock ID token in development", () => {
        const idToken = oidcProvider._generateMockIdToken();

        expect(idToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // JWT format
        expect(idToken.split(".").length).toBe(3);
      });
    });
  });

  describe("Input Validation", () => {
    test("should validate callback data structure", async () => {
      const oauth2Provider = new OAuth2Provider({
        clientId: "test",
        clientSecret: "secret",
      });

      process.env.NODE_ENV = "development";

      await expect(
        oauth2Provider.exchangeCodeForTokens(null),
      ).rejects.toThrow();

      await expect(oauth2Provider.exchangeCodeForTokens({})).rejects.toThrow(
        "Authorization code is required",
      );
    });
  });

  describe("SSOManager Integration", () => {
    test("should properly initialize providers based on configuration", async () => {
      const ssoManager = new SSOManager({
        providers: {
          saml: { enabled: true, entityId: "test" },
          oauth2: { enabled: true, clientId: "test", clientSecret: "secret" },
          activeDirectory: { enabled: false },
          oidc: {
            enabled: true,
            issuer: "https://oidc.example.com",
            clientId: "test",
          },
        },
      });

      await ssoManager._initializeProviders();

      expect(ssoManager.providers.has("saml")).toBe(true);
      expect(ssoManager.providers.has("oauth2")).toBe(true);
      expect(ssoManager.providers.has("ad")).toBe(false);
      expect(ssoManager.providers.has("oidc")).toBe(true);
    });

    test("should handle provider errors gracefully", async () => {
      const ssoManager = new SSOManager();

      await expect(
        ssoManager.initiateLogin("tenant1", "nonexistent", "https://app.com"),
      ).rejects.toThrow("SSO provider nonexistent not configured");
    });
  });
});
