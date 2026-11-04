/**
 * ACL enforcement is a rule, not a classifier, so it is tested for
 * correctness rather than measured: for every combination of a document's
 * restriction and a user's permissions, a document the user may not see is
 * removed and one they may see is kept.
 *
 * The rule: a document restricted by `requiredRole` or `acl` (a role or a
 * list of roles, on the result or in its `metadata`) is visible when the
 * user has at least one of those roles. An unrestricted document (no field,
 * an empty list, null) is visible to everyone. Missing userPermissions
 * means no roles.
 */

const { RetrievalGuard } = require("../../../src/guardrails/retrieval-guard");

const ROLES = ["hr", "finance", "staff"];

const RESTRICTIONS = [
  { name: "none", fields: {}, allowed: null },
  { name: "empty acl", fields: { acl: [] }, allowed: null },
  { name: "null acl", fields: { acl: null }, allowed: null },
  { name: "requiredRole hr", fields: { requiredRole: "hr" }, allowed: ["hr"] },
  { name: "acl [hr]", fields: { acl: ["hr"] }, allowed: ["hr"] },
  {
    name: "acl [hr, finance]",
    fields: { acl: ["hr", "finance"] },
    allowed: ["hr", "finance"],
  },
  {
    name: "requiredRole [finance]",
    fields: { requiredRole: ["finance"] },
    allowed: ["finance"],
  },
];

// Every subset of ROLES, plus missing and null permissions
const PERMISSIONS = [
  { name: "missing", context: {}, roles: [] },
  { name: "null", context: { userPermissions: null }, roles: [] },
  ...Array.from({ length: 2 ** ROLES.length }, (_, mask) => {
    const roles = ROLES.filter((_, i) => mask & (1 << i));
    return {
      name: `[${roles.join(", ")}]`,
      context: { userPermissions: roles },
      roles,
    };
  }),
];

const visible = (allowed, roles) =>
  allowed === null || allowed.some((r) => roles.includes(r));

const PLACEMENTS = [
  ["on the result", (fields) => ({ id: "doc", score: 0.9, ...fields })],
  [
    "in metadata",
    (fields) => ({
      id: "doc",
      score: 0.9,
      metadata: { source: "a", ...fields },
    }),
  ],
];

describe.each(PLACEMENTS)("RetrievalGuard ACL, restriction %s", (_, build) => {
  const guard = new RetrievalGuard({ enforceACL: true });

  const cases = RESTRICTIONS.flatMap((r) =>
    PERMISSIONS.map((p) => [r.name, p.name, r, p]),
  );

  test.each(cases)("document %s, user %s", (_r, _p, restriction, user) => {
    const doc = build(restriction.fields);
    const { results, metadata } = guard.filter([doc], user.context);
    const shouldSee = visible(restriction.allowed, user.roles);
    expect(results.map((d) => d.id)).toEqual(shouldSee ? ["doc"] : []);
    expect(metadata.reasons.acl || 0).toBe(shouldSee ? 0 : 1);
  });
});

describe("RetrievalGuard ACL across a result set", () => {
  const guard = new RetrievalGuard({ enforceACL: true });

  test("keeps exactly the visible documents, in order", () => {
    const docs = RESTRICTIONS.map((r, i) => ({
      id: `d${i}`,
      score: 0.9,
      ...(i % 2 ? { metadata: { ...r.fields } } : r.fields),
    }));
    for (const user of PERMISSIONS) {
      const { results } = guard.filter(docs, user.context);
      const expected = RESTRICTIONS.map((r, i) =>
        visible(r.allowed, user.roles) ? `d${i}` : null,
      ).filter(Boolean);
      expect(results.map((d) => d.id)).toEqual(expected);
    }
  });

  test("a top-level restriction wins over metadata", () => {
    const { results } = guard.filter(
      [{ id: "d", score: 0.9, acl: ["hr"], metadata: { acl: ["staff"] } }],
      { userPermissions: ["staff"] },
    );
    expect(results).toEqual([]);
  });

  test("role names match exactly", () => {
    const { results } = guard.filter(
      [
        { id: "case", score: 0.9, acl: ["HR"] },
        { id: "prefix", score: 0.9, acl: ["hr-admin"] },
      ],
      { userPermissions: ["hr"] },
    );
    expect(results).toEqual([]);
  });

  test("without enforceACL, nothing is removed for permissions", () => {
    const open = new RetrievalGuard();
    const { results } = open.filter([{ id: "d", score: 0.9, acl: ["hr"] }], {});
    expect(results.map((d) => d.id)).toEqual(["d"]);
  });
});
