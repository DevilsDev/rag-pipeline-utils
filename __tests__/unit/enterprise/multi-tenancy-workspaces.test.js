/**
 * TenantManager (experimental): the workspace quota is enforced, a
 * workspace can switch plugins off, and a hard delete removes the tenant's
 * workspaces and its folder.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { TenantManager } = require("../../../src/enterprise/multi-tenancy");

let dataDir;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tenants-"));
});
afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function tenantWith(quotas) {
  const tm = new TenantManager({ dataDir });
  const t = await tm.createTenant({ name: "acme", quotas });
  return { tm, t };
}

describe("TenantManager workspaces", () => {
  test("maxWorkspaces stops further workspaces", async () => {
    const { tm, t } = await tenantWith({ maxWorkspaces: 1 });
    await tm.createWorkspace(t.id, { name: "w0" });
    await expect(tm.createWorkspace(t.id, { name: "w1" })).rejects.toThrow(
      /quota/i,
    );
    expect(await tm.getWorkspaces(t.id)).toHaveLength(1);
  });

  test("another tenant's workspaces do not count against the quota", async () => {
    const tm = new TenantManager({ dataDir });
    const a = await tm.createTenant({
      name: "a",
      quotas: { maxWorkspaces: 1 },
    });
    const b = await tm.createTenant({
      name: "b",
      quotas: { maxWorkspaces: 1 },
    });
    await tm.createWorkspace(a.id, { name: "wa" });
    await expect(
      tm.createWorkspace(b.id, { name: "wb" }),
    ).resolves.toBeTruthy();
  });

  test("pluginsEnabled: false is kept, and the default is true", async () => {
    const { tm, t } = await tenantWith({});
    const off = await tm.createWorkspace(t.id, {
      name: "off",
      pluginsEnabled: false,
    });
    const on = await tm.createWorkspace(t.id, { name: "on" });
    expect(off.settings.pluginsEnabled).toBe(false);
    expect(on.settings.pluginsEnabled).toBe(true);
  });

  test("a hard delete removes the tenant's workspaces and its folder", async () => {
    const { tm, t } = await tenantWith({});
    const other = await tm.createTenant({ name: "other" });
    await tm.createWorkspace(t.id, { name: "w0" });
    await tm.createWorkspace(t.id, { name: "w1" });
    await tm.createWorkspace(other.id, { name: "keep" });
    const folder = t.isolation.dataPath;
    await tm.deleteTenant(t.id, { hardDelete: true });
    expect(await tm.getWorkspaces(t.id)).toHaveLength(0);
    expect(await tm.getWorkspaces(other.id)).toHaveLength(1);
    expect(fs.existsSync(folder)).toBe(false);
    expect(fs.existsSync(other.isolation.dataPath)).toBe(true);
  });
});
