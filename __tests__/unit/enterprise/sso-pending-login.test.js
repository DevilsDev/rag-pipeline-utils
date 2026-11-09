/**
 * SSO (experimental): a pending login (keyed by its state in the session
 * map) must not break cleanupExpiredSessions() or getActiveSessions().
 */

const { SSOManager } = require("../../../src/enterprise/sso-integration.js");

function manager() {
  return new SSOManager({
    jwtSecret: "x".repeat(64),
    jwtIssuer: "i",
    providers: {
      oauth2: {
        enabled: true,
        clientId: "c",
        clientSecret: "s",
        authorizationUrl: "https://idp.example/authorize",
        tokenUrl: "https://idp.example/token",
        userInfoUrl: "https://idp.example/me",
        redirectUri: "https://app.example/cb",
      },
    },
  });
}

describe("SSOManager with a pending login", () => {
  test("cleanupExpiredSessions() resolves and keeps a login that has not expired", async () => {
    const m = manager();
    const login = await m.initiateLogin("t1", "oauth2", "https://app.example/");
    await expect(m.cleanupExpiredSessions()).resolves.toEqual({
      cleanedSessions: 0,
    });
    expect(m.sessions.has(login.state)).toBe(true);
  });

  test("cleanupExpiredSessions() removes an expired login", async () => {
    const m = manager();
    const login = await m.initiateLogin("t1", "oauth2", "https://app.example/");
    m.sessions.get(login.state).expiresAt = Date.now() - 1;
    const result = await m.cleanupExpiredSessions();
    expect(result.cleanedSessions).toBe(1);
    expect(m.sessions.has(login.state)).toBe(false);
  });

  test("getActiveSessions() does not list or choke on a pending login", async () => {
    const m = manager();
    await m.initiateLogin("t1", "oauth2", "https://app.example/");
    await expect(m.getActiveSessions("t1")).resolves.toEqual([]);
  });
});
