import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canEditAllProjectsNote,
  canEditPmNote,
  canOpenPortfolio,
  effectiveDashboardScopes,
  hasDashboardScope,
  isUuid,
  portfolioAccessFor,
  portfolioNoteKey,
  privilegeDefaultsForRole,
  resolvePortfolioScope,
  sanitizeDashboardScopes,
  viewerSeesEveryActiveProject,
} from "@/src/lib/dashboard-access";

describe("dashboard access", () => {
  it("gives a PM every scope and a Member or Viewer only per-project analytics", () => {
    assert.deepEqual(privilegeDefaultsForRole("pm").dashboardAccess, [
      "PROJECT",
      "PM_PORTFOLIO",
      "TOTAL_COMPANY",
    ]);
    assert.deepEqual(privilegeDefaultsForRole("member").dashboardAccess, [
      "PROJECT",
    ]);
    assert.deepEqual(privilegeDefaultsForRole("viewer").dashboardAccess, [
      "PROJECT",
    ]);
  });

  it("locks a Super PM to every scope even when the stored list is empty", () => {
    assert.deepEqual(effectiveDashboardScopes("super_pm", []), [
      "PROJECT",
      "PM_PORTFOLIO",
      "TOTAL_COMPANY",
    ]);
    assert.equal(
      hasDashboardScope(
        { globalRole: "super_pm", dashboardAccess: [] },
        "TOTAL_COMPANY",
      ),
      true,
    );
  });

  it("drops unknown scopes and keeps a deliberate revoke", () => {
    assert.deepEqual(sanitizeDashboardScopes(["PROJECT", "NOPE", "PROJECT"]), [
      "PROJECT",
    ]);
    assert.equal(
      hasDashboardScope({ globalRole: "member", dashboardAccess: [] }, "PROJECT"),
      false,
    );
  });

  it("treats All Active as a Viewer project list, not a role-wide grant", () => {
    assert.equal(
      viewerSeesEveryActiveProject({
        globalRole: "viewer",
        projectVisibilityMode: "ALL_ACTIVE",
      }),
      true,
    );
    assert.equal(
      viewerSeesEveryActiveProject({
        globalRole: "member",
        projectVisibilityMode: "ALL_ACTIVE",
      }),
      false,
    );
    assert.equal(
      viewerSeesEveryActiveProject({
        globalRole: "viewer",
        projectVisibilityMode: "SELECTED",
      }),
      false,
    );
  });
});

describe("portfolio access", () => {
  const pm = (id: string, scopes: string[]) => ({
    id,
    globalRole: "pm" as const,
    dashboardAccess: scopes,
  });

  it("opens each view only with its own tick", () => {
    assert.deepEqual(portfolioAccessFor(pm("a", ["PROJECT"])), {
      pm: false,
      all: false,
    });
    assert.deepEqual(portfolioAccessFor(pm("a", ["PM_PORTFOLIO"])), {
      pm: true,
      all: false,
    });
    assert.deepEqual(portfolioAccessFor(pm("a", ["TOTAL_COMPANY"])), {
      pm: false,
      all: true,
    });
    assert.equal(canOpenPortfolio(pm("a", ["PROJECT"])), false);
    assert.equal(canOpenPortfolio(pm("a", ["TOTAL_COMPANY"])), true);
  });

  it("never lets a Viewer on All Active open the portfolio without a tick", () => {
    const viewer = {
      globalRole: "viewer" as const,
      dashboardAccess: ["PROJECT"],
      projectVisibilityMode: "ALL_ACTIVE" as const,
    };
    assert.equal(canOpenPortfolio(viewer), false);
    assert.equal(
      canOpenPortfolio({ ...viewer, dashboardAccess: ["TOTAL_COMPANY"] }),
      true,
    );
  });

  it("always opens for a Super PM", () => {
    assert.deepEqual(
      portfolioAccessFor({ globalRole: "super_pm", dashboardAccess: [] }),
      { pm: true, all: true },
    );
  });

  it("falls back to the view the person holds", () => {
    const both = { pm: true, all: true };
    assert.equal(resolvePortfolioScope(both, "all"), "all");
    assert.equal(resolvePortfolioScope(both, "pm"), "pm");
    assert.equal(resolvePortfolioScope(both, undefined), "pm");
    assert.equal(resolvePortfolioScope(both, "bogus"), "pm");
    assert.equal(resolvePortfolioScope({ pm: false, all: true }, "pm"), "all");
    assert.equal(resolvePortfolioScope({ pm: true, all: false }, "all"), "pm");
    assert.equal(resolvePortfolioScope({ pm: false, all: false }, "all"), null);
  });

  it("applies decision D3 to note editing", () => {
    const owner = pm("11111111-1111-4111-8111-111111111111", [
      "PM_PORTFOLIO",
      "TOTAL_COMPANY",
    ]);
    const peer = pm("22222222-2222-4222-8222-222222222222", [
      "PM_PORTFOLIO",
      "TOTAL_COMPANY",
    ]);
    const superPm = {
      id: "33333333-3333-4333-8333-333333333333",
      globalRole: "super_pm" as const,
      dashboardAccess: [],
    };
    const member = {
      id: "44444444-4444-4444-8444-444444444444",
      globalRole: "member" as const,
      dashboardAccess: ["PM_PORTFOLIO", "TOTAL_COMPANY"],
    };
    assert.equal(canEditAllProjectsNote(owner), true);
    assert.equal(canEditAllProjectsNote(peer), true);
    assert.equal(canEditAllProjectsNote(superPm), true);
    assert.equal(canEditAllProjectsNote(member), false);
    assert.equal(canEditAllProjectsNote(pm("x", ["PM_PORTFOLIO"])), false);

    assert.equal(canEditPmNote(owner, owner.id), true);
    assert.equal(canEditPmNote(peer, owner.id), false);
    assert.equal(canEditPmNote(superPm, owner.id), true);
    assert.equal(canEditPmNote(member, member.id), false);
    assert.equal(canEditPmNote(pm(owner.id, ["TOTAL_COMPANY"]), owner.id), false);
  });

  it("builds one stable key per scope", () => {
    assert.equal(portfolioNoteKey("all"), "ALL");
    assert.equal(
      portfolioNoteKey("pm", "AAAAAAAA-1111-4111-8111-111111111111"),
      "PM:aaaaaaaa-1111-4111-8111-111111111111",
    );
    assert.throws(() => portfolioNoteKey("pm", "not-a-uuid"));
    assert.equal(isUuid("not-a-uuid"), false);
    assert.equal(isUuid("aaaaaaaa-1111-4111-8111-111111111111"), true);
  });
});
