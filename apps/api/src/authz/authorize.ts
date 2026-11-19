import type { Tier } from "@mops/shared";

/**
 * Single authorization decision for REST routes and AI tools.
 * The model is never asked whether a user may do something. Deny by default.
 * Project membership is passed in from DynamoDB, not from the token.
 */
export type Action =
  | "ticket.read"
  | "ticket.create"
  | "ticket.edit"
  | "ticket.status"
  | "ticket.comment"
  | "ticket.delete"
  | "audit.read"
  | "user.manage"
  | "membership.manage"
  | "ai.briefing"
  | "ai.audit"
  | "metrics.read";

export interface AuthSubject {
  userId: string;
  tier: Tier;
  projectIds: string[];
}

export interface Resource {
  projectId?: string;
  isSandbox?: boolean;
}

export interface Decision {
  allowed: boolean;
  reason: string;
}

const TICKET_ACTIONS = new Set<Action>([
  "ticket.read",
  "ticket.create",
  "ticket.edit",
  "ticket.status",
  "ticket.comment",
  "ticket.delete",
]);

const T1_ONLY = new Set<Action>([
  "audit.read",
  "user.manage",
  "membership.manage",
  "ai.audit",
  "metrics.read",
]);

function allow(): Decision {
  return { allowed: true, reason: "allowed" };
}

function deny(reason: string): Decision {
  return { allowed: false, reason };
}

export function authorize(user: AuthSubject, action: Action, resource: Resource = {}): Decision {
  if (T1_ONLY.has(action)) {
    return user.tier === "T1" ? allow() : deny("tier");
  }

  if (action === "ai.briefing") {
    return allow();
  }

  if (!TICKET_ACTIONS.has(action)) {
    return deny("unknown_action");
  }

  if (!resource.projectId) {
    return deny("missing_project");
  }

  if (resource.isSandbox) {
    return user.tier === "T1" ? allow() : deny("sandbox_t1_only");
  }

  if (user.tier === "T1") {
    return deny("t1_real_project");
  }

  if (!user.projectIds.includes(resource.projectId)) {
    return deny("not_a_member");
  }

  if (user.tier === "T2") {
    return allow();
  }

  if (user.tier === "T3") {
    if (action === "ticket.read" || action === "ticket.status" || action === "ticket.comment") {
      return allow();
    }
    return deny("t3_write_forbidden");
  }

  return deny("deny_default");
}

const T1_TOOLS = [
  "search_tickets",
  "get_ticket",
  "get_briefing_data",
  "propose_create_ticket",
  "propose_edit_ticket",
  "propose_comment",
  "propose_status_change",
  "propose_delete_ticket",
  "query_audit_logs",
];

const T2_TOOLS = [
  "search_tickets",
  "get_ticket",
  "list_project_members",
  "get_briefing_data",
  "propose_create_ticket",
  "propose_edit_ticket",
  "propose_comment",
  "propose_status_change",
  "propose_delete_ticket",
  "propose_tickets_from_text",
  "summarize_thread",
];

const T3_TOOLS = [
  "search_tickets",
  "get_ticket",
  "list_project_members",
  "get_briefing_data",
  "propose_comment",
  "propose_status_change",
  "summarize_thread",
];

/** Only these names are sent to the model. The server still calls authorize() on every tool. */
export function toolsForTier(tier: Tier): string[] {
  if (tier === "T1") return [...T1_TOOLS];
  if (tier === "T2") return [...T2_TOOLS];
  return [...T3_TOOLS];
}

export function actionForTool(name: string): Action | null {
  switch (name) {
    case "search_tickets":
    case "get_ticket":
    case "summarize_thread":
      return "ticket.read";
    case "list_project_members":
      return "ticket.read";
    case "get_briefing_data":
      return "ai.briefing";
    case "query_audit_logs":
      return "ai.audit";
    case "propose_create_ticket":
    case "propose_tickets_from_text":
      return "ticket.create";
    case "propose_edit_ticket":
      return "ticket.edit";
    case "propose_comment":
      return "ticket.comment";
    case "propose_status_change":
      return "ticket.status";
    case "propose_delete_ticket":
      return "ticket.delete";
    default:
      return null;
  }
}
