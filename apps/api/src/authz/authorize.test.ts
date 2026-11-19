import { describe, expect, it } from "vitest";
import { authorize, toolsForTier, type Action, type AuthSubject } from "./authorize.js";

const actions: Action[] = [
  "ticket.read",
  "ticket.create",
  "ticket.edit",
  "ticket.status",
  "ticket.comment",
  "ticket.delete",
  "audit.read",
  "user.manage",
  "membership.manage",
  "ai.briefing",
  "ai.audit",
  "metrics.read",
];

const ticketWrites: Action[] = ["ticket.create", "ticket.edit", "ticket.delete"];
const ticketUse: Action[] = ["ticket.read", "ticket.status", "ticket.comment"];
const adminActions: Action[] = ["audit.read", "user.manage", "membership.manage", "ai.audit", "metrics.read"];

function user(partial: Partial<AuthSubject> & Pick<AuthSubject, "tier">): AuthSubject {
  return { userId: "u1", projectIds: ["apollo"], ...partial };
}

describe("authorize", () => {
  it("denies ticket actions when the project is missing", () => {
    for (const action of [...ticketUse, ...ticketWrites]) {
      expect(authorize(user({ tier: "T2" }), action).allowed).toBe(false);
    }
  });

  it("lets T1 do every ticket action in the sandbox and none in a real project", () => {
    const admin = user({ tier: "T1", projectIds: [] });
    for (const action of [...ticketUse, ...ticketWrites]) {
      expect(authorize(admin, action, { projectId: "sandbox", isSandbox: true }).allowed).toBe(true);
      expect(authorize(admin, action, { projectId: "apollo", isSandbox: false }).allowed).toBe(false);
    }
    for (const action of adminActions) {
      expect(authorize(admin, action).allowed).toBe(true);
    }
    expect(authorize(admin, "ai.briefing").allowed).toBe(true);
  });

  it("lets T2 do every ticket action only inside a member project", () => {
    const pm = user({ tier: "T2", projectIds: ["apollo"] });
    for (const action of [...ticketUse, ...ticketWrites]) {
      expect(authorize(pm, action, { projectId: "apollo", isSandbox: false }).allowed).toBe(true);
      expect(authorize(pm, action, { projectId: "nexus", isSandbox: false }).allowed).toBe(false);
      expect(authorize(pm, action, { projectId: "sandbox", isSandbox: true }).allowed).toBe(false);
    }
    for (const action of adminActions) {
      expect(authorize(pm, action).allowed).toBe(false);
    }
    expect(authorize(pm, "ai.briefing").allowed).toBe(true);
  });

  it("lets T3 read, comment, and change status, and denies create, edit, and delete", () => {
    const dev = user({ tier: "T3", projectIds: ["apollo"] });
    for (const action of ticketUse) {
      expect(authorize(dev, action, { projectId: "apollo", isSandbox: false }).allowed).toBe(true);
    }
    for (const action of ticketWrites) {
      expect(authorize(dev, action, { projectId: "apollo", isSandbox: false }).allowed).toBe(false);
    }
    expect(authorize(dev, "ticket.read", { projectId: "helios", isSandbox: false }).allowed).toBe(false);
    expect(authorize(dev, "ticket.read", { projectId: "sandbox", isSandbox: true }).allowed).toBe(false);
    for (const action of adminActions) {
      expect(authorize(dev, action).allowed).toBe(false);
    }
    expect(authorize(dev, "ai.briefing").allowed).toBe(true);
  });

  it("covers every action for every tier at least once", () => {
    const subjects = [
      user({ tier: "T1", projectIds: [] }),
      user({ tier: "T2", projectIds: ["apollo"] }),
      user({ tier: "T3", projectIds: ["apollo"] }),
    ];
    for (const subject of subjects) {
      for (const action of actions) {
        const decision = authorize(subject, action, { projectId: "apollo", isSandbox: false });
        expect(typeof decision.allowed).toBe("boolean");
        expect(decision.reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("toolsForTier", () => {
  it("does not offer delete or create tools to a developer", () => {
    const tools = toolsForTier("T3");
    expect(tools).not.toContain("propose_delete_ticket");
    expect(tools).not.toContain("propose_create_ticket");
    expect(tools).not.toContain("query_audit_logs");
    expect(tools).toContain("propose_comment");
    expect(tools).toContain("propose_status_change");
  });

  it("offers audit logs only to T1 and bulk proposals only to T2", () => {
    expect(toolsForTier("T1")).toContain("query_audit_logs");
    expect(toolsForTier("T1")).not.toContain("propose_tickets_from_text");
    expect(toolsForTier("T2")).toContain("propose_tickets_from_text");
    expect(toolsForTier("T2")).toContain("propose_delete_ticket");
    expect(toolsForTier("T2")).not.toContain("query_audit_logs");
  });
});
