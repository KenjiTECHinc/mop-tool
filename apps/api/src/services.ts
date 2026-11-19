import { randomUUID } from "node:crypto";
import {
  bulkProposalSchema,
  ticketPatchSchema,
  ticketWriteSchema,
  type Channel,
  type Language,
  type Priority,
  type Status,
  type TicketType,
  type Tier,
} from "@mops/shared";
import { recordAudit, type AuditInput } from "./audit.js";
import type { AppConfig } from "./config.js";
import {
  Store,
  type CommentRecord,
  type PendingRecord,
  type ProjectRecord,
  type TicketRecord,
  type UserRecord,
} from "./db/sqlite.js";
import { ApiError, projectIdFromTicket } from "./http.js";
import { authorize, type Action, type AuthSubject } from "./authz/authorize.js";
import { redactSecrets } from "./ai/redact.js";

export interface Actor {
  userId: string;
  tier: Tier;
  name: string;
  jobTitle: string;
  projectIds: string[];
  preferredLanguage: Language;
  previousSeenAt?: string;
  email: string;
}

export interface Ctx {
  store: Store;
  config: AppConfig;
  actor: Actor;
  requestId: string;
  channel: Channel;
  conversationId?: string;
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export async function audit(ctx: Ctx, input: Omit<AuditInput, "actorUserId" | "actorTier" | "channel" | "requestId">): Promise<void> {
  await recordAudit(ctx.store, ctx.config, {
    ...input,
    actorUserId: ctx.actor.userId,
    actorTier: ctx.actor.tier,
    channel: ctx.channel,
    requestId: ctx.requestId,
    conversationId: input.conversationId ?? ctx.conversationId,
  });
}

export async function visibleProjects(ctx: Ctx): Promise<ProjectRecord[]> {
  if (ctx.actor.tier === "T1") {
    const sandbox = await ctx.store.getProject("sandbox");
    return sandbox?.isSandbox ? [sandbox] : [];
  }
  const projects = await ctx.store.projectsByIds(ctx.actor.projectIds);
  return projects.filter((project) => !project.isSandbox);
}

async function projectOrThrow(ctx: Ctx, projectId: string): Promise<ProjectRecord> {
  const project = await ctx.store.getProject(projectId);
  if (!project) throw new ApiError(404, "NOT_FOUND");
  return project;
}

export async function decide(
  ctx: Ctx,
  action: Action,
  project: ProjectRecord | undefined,
  resourceId = "",
): Promise<void> {
  const subject: AuthSubject = ctx.actor;
  const decision = authorize(subject, action, project ? { projectId: project.projectId, isSandbox: project.isSandbox } : {});
  if (decision.allowed) return;
  await audit(ctx, {
    action: "authz.denied",
    outcome: "denied",
    resourceType: "project",
    resourceId: resourceId || project?.projectId || "",
    projectId: project?.projectId,
    reason: decision.reason,
    toolName: action,
  });
  throw new ApiError(403, "FORBIDDEN");
}

export async function createTicket(
  ctx: Ctx,
  input: {
    projectId: string;
    title: string;
    description: string;
    type: TicketType;
    priority: Priority;
    assigneeId?: string;
    labels?: string[];
    acceptanceCriteria?: string;
  },
): Promise<{ ticket: TicketRecord; redacted: boolean }> {
  const parsed = ticketWriteSchema.parse(input);
  const project = await projectOrThrow(ctx, parsed.projectId);
  await decide(ctx, "ticket.create", project);
  const title = redactSecrets(parsed.title);
  const description = redactSecrets(parsed.description);
  const criteria = redactSecrets(parsed.acceptanceCriteria ?? "");
  const number = await ctx.store.allocateTicketNumber(project.projectId);
  const now = new Date().toISOString();
  const ticket: TicketRecord = {
    projectId: project.projectId,
    ticketId: `${project.key}-${number}`,
    title: title.text,
    description: description.text,
    type: parsed.type,
    status: "todo",
    priority: parsed.priority,
    assigneeId: parsed.assigneeId,
    reporterId: ctx.actor.userId,
    labels: parsed.labels ?? [],
    acceptanceCriteria: criteria.text,
    createdAt: now,
    updatedAt: now,
    version: 1,
    createdVia: ctx.channel,
  };
  await ctx.store.putTicket(ticket);
  await audit(ctx, {
    action: "ticket.create",
    outcome: "allowed",
    resourceType: "ticket",
    resourceId: ticket.ticketId,
    projectId: ticket.projectId,
    reason: ctx.channel === "ai" ? "origin:ai" : "origin:ui",
  });
  return { ticket, redacted: title.redacted || description.redacted || criteria.redacted };
}

export async function editTicket(
  ctx: Ctx,
  ticketId: string,
  patch: Record<string, unknown>,
): Promise<{ ticket: TicketRecord; redacted: boolean }> {
  const parsed = ticketPatchSchema.parse(patch);
  const ticket = await loadTicket(ctx, ticketId, "ticket.edit");
  const title = parsed.title === undefined ? { text: ticket.title, redacted: false } : redactSecrets(parsed.title);
  const description = parsed.description === undefined ? { text: ticket.description, redacted: false } : redactSecrets(parsed.description);
  const criteria =
    parsed.acceptanceCriteria === undefined
      ? { text: ticket.acceptanceCriteria, redacted: false }
      : redactSecrets(parsed.acceptanceCriteria);
  const next = await ctx.store.updateTicket(
    {
      ...ticket,
      title: title.text,
      description: description.text,
      acceptanceCriteria: criteria.text,
      type: parsed.type ?? ticket.type,
      priority: parsed.priority ?? ticket.priority,
      assigneeId: parsed.assigneeId === undefined ? ticket.assigneeId : parsed.assigneeId,
      labels: parsed.labels ?? ticket.labels,
    },
    parsed.version,
  );
  await audit(ctx, {
    action: "ticket.update",
    outcome: "allowed",
    resourceType: "ticket",
    resourceId: ticket.ticketId,
    projectId: ticket.projectId,
    reason: ticket.createdVia === "ai" ? "ai_origin" : "ui_origin",
  });
  return { ticket: next, redacted: title.redacted || description.redacted || criteria.redacted };
}

export async function changeStatus(ctx: Ctx, ticketId: string, status: Status, version: number): Promise<TicketRecord> {
  const ticket = await loadTicket(ctx, ticketId, "ticket.status");
  const next = await ctx.store.updateTicket({ ...ticket, status }, version);
  await audit(ctx, {
    action: "ticket.status",
    outcome: "allowed",
    resourceType: "ticket",
    resourceId: ticket.ticketId,
    projectId: ticket.projectId,
    reason: status,
  });
  return next;
}

export async function addComment(ctx: Ctx, ticketId: string, body: string): Promise<{ comment: CommentRecord; redacted: boolean }> {
  const ticket = await loadTicket(ctx, ticketId, "ticket.comment");
  const clean = redactSecrets(body);
  const createdAt = new Date().toISOString();
  const commentId = randomUUID();
  const comment: CommentRecord = {
    ticketId: ticket.ticketId,
    sk: `${createdAt}#${commentId}`,
    commentId,
    authorId: ctx.actor.userId,
    body: clean.text,
    createdAt,
    createdVia: ctx.channel,
  };
  await ctx.store.putComment(comment);
  await audit(ctx, {
    action: "ticket.comment",
    outcome: "allowed",
    resourceType: "comment",
    resourceId: commentId,
    projectId: ticket.projectId,
    reason: ctx.channel === "ai" ? "origin:ai" : "origin:ui",
  });
  return { comment, redacted: clean.redacted };
}

export async function removeTicket(ctx: Ctx, ticketId: string, version: number): Promise<void> {
  const ticket = await loadTicket(ctx, ticketId, "ticket.delete");
  await ctx.store.deleteTicket(ticket.projectId, ticket.ticketId, version);
  await audit(ctx, {
    action: "ticket.delete",
    outcome: "allowed",
    resourceType: "ticket",
    resourceId: ticket.ticketId,
    projectId: ticket.projectId,
    reason: "deleted",
  });
}

export async function loadTicket(ctx: Ctx, ticketId: string, action: Action): Promise<TicketRecord> {
  const projectId = projectIdFromTicket(ticketId);
  if (!projectId) throw new ApiError(404, "NOT_FOUND");
  const project = await ctx.store.getProject(projectId);
  if (!project) throw new ApiError(404, "NOT_FOUND");
  await decide(ctx, action, project, ticketId);
  const ticket = await ctx.store.getTicket(project.projectId, ticketId);
  if (!ticket) throw new ApiError(404, "NOT_FOUND");
  return ticket;
}

export async function searchTickets(
  ctx: Ctx,
  filters: { projectId?: string; status?: Status; assigneeId?: string; text?: string },
): Promise<TicketRecord[]> {
  const projects = filters.projectId
    ? [await projectOrThrow(ctx, filters.projectId)]
    : await visibleProjects(ctx);
  const matches: TicketRecord[] = [];
  for (const project of projects) {
    await decide(ctx, "ticket.read", project);
    const tickets = await ctx.store.listTickets(project.projectId);
    for (const ticket of tickets) {
      if (filters.status && ticket.status !== filters.status) continue;
      if (filters.assigneeId && ticket.assigneeId !== filters.assigneeId) continue;
      if (filters.text && !ticket.title.toLowerCase().includes(filters.text.toLowerCase())) continue;
      matches.push(ticket);
    }
  }
  return matches.slice(0, 15);
}

export function toCard(ticket: TicketRecord): { ticketId: string; title: string; status: Status; projectId: string } {
  return {
    ticketId: ticket.ticketId,
    title: ticket.title,
    status: ticket.status,
    projectId: ticket.projectId,
  };
}

export async function briefingPack(ctx: Ctx): Promise<Record<string, unknown>> {
  if (ctx.actor.tier === "T1") {
    const users = await ctx.store.listUsers();
    const events = await recentAudit(ctx, 7);
    return {
      scope: "platform",
      activeUsers: users.filter((user) => user.status === "active").length,
      deniedActions: events.filter((event) => event.action === "authz.denied").length,
      guardrailBlocks: events.filter((event) => event.action === "ai.guardrail_blocked").length,
      failedLogins: events.filter((event) => event.action === "auth.login" && event.outcome === "denied").length,
    };
  }

  const projects = await visibleProjects(ctx);
  const assigned = (await ctx.store.ticketsForAssignee(ctx.actor.userId)).filter((ticket) =>
    projects.some((project) => project.projectId === ticket.projectId),
  );
  const now = Date.now();
  const stale = (ticket: TicketRecord) => now - Date.parse(ticket.updatedAt) >= STALE_MS && ticket.status !== "done";

  if (ctx.actor.tier === "T3" || !ctx.actor.jobTitle.toLowerCase().includes("cto")) {
    if (ctx.actor.tier === "T3") {
      const comments = await newComments(ctx, assigned);
      return {
        scope: "developer",
        byStatus: countBy(assigned, (ticket) => ticket.status),
        blocked: assigned.filter((ticket) => ticket.status === "blocked").map(toCard),
        stale: assigned.filter(stale).map(toCard),
        newCommentTicketIds: comments,
      };
    }
  }

  if (ctx.actor.jobTitle.toLowerCase().includes("cto")) {
    const all: TicketRecord[] = [];
    for (const project of projects) all.push(...(await ctx.store.listTickets(project.projectId)));
    const risks = all
      .filter((ticket) => ticket.status === "blocked" || (stale(ticket) && (ticket.priority === "high" || ticket.priority === "critical")))
      .slice(0, 3)
      .map(toCard);
    return {
      scope: "cto",
      projects: projects.map((project) => project.projectId),
      counts: countBy(all, (ticket) => ticket.status),
      risks,
    };
  }

  const perProject = [];
  const workload = new Map<string, number>();
  for (const project of projects) {
    const tickets = await ctx.store.listTickets(project.projectId);
    perProject.push({
      projectId: project.projectId,
      counts: countBy(tickets, (ticket) => ticket.status),
      blocked: tickets.filter((ticket) => ticket.status === "blocked").length,
      stale: tickets.filter(stale).length,
      unassigned: tickets.filter((ticket) => !ticket.assigneeId && ticket.status !== "done").length,
    });
    for (const ticket of tickets) {
      if (!ticket.assigneeId || ticket.status === "done") continue;
      workload.set(ticket.assigneeId, (workload.get(ticket.assigneeId) ?? 0) + 1);
    }
  }
  const overloaded = [...workload.entries()].filter(([, count]) => count >= 5).map(([assigneeId, count]) => ({ assigneeId, count }));
  return { scope: "pm", perProject, overloaded };
}

async function newComments(ctx: Ctx, tickets: TicketRecord[]): Promise<string[]> {
  const since = ctx.actor.previousSeenAt;
  if (!since) return [];
  const ids: string[] = [];
  for (const ticket of tickets) {
    const comments = await ctx.store.listComments(ticket.ticketId);
    if (comments.some((comment) => comment.createdAt > since && comment.authorId !== ctx.actor.userId)) {
      ids.push(ticket.ticketId);
    }
  }
  return ids;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const name = key(item);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

async function recentAudit(ctx: Ctx, days: number) {
  const events = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    events.push(...(await ctx.store.queryAudit(date.toISOString().slice(0, 10))));
  }
  return events;
}

export async function queryAudit(ctx: Ctx, day?: string) {
  await decide(ctx, "ai.audit", undefined);
  const events = day ? await ctx.store.queryAudit(day) : await recentAudit(ctx, 7);
  return events.map((event) => ({
    timestamp: event.timestamp,
    actorUserId: event.actorUserId,
    actorTier: event.actorTier,
    channel: event.channel,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    projectId: event.projectId,
    outcome: event.outcome,
    toolName: event.toolName,
    reason: event.reason,
  }));
}

export async function propose(
  ctx: Ctx,
  toolName: string,
  payload: Record<string, unknown>,
  projectId: string,
  resourceId: string,
): Promise<PendingRecord> {
  const action: PendingRecord = {
    actionId: randomUUID(),
    userId: ctx.actor.userId,
    toolName,
    payload,
    status: "pending",
    conversationId: ctx.conversationId ?? "",
    createdAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 300,
    projectId,
    resourceId,
  };
  await ctx.store.putPending(action);
  await audit(ctx, {
    action: "ai.action_proposed",
    outcome: "allowed",
    resourceType: "pending_action",
    resourceId: action.actionId,
    projectId,
    toolName,
    reason: resourceId ? `resource:${resourceId}` : "proposed",
  });
  return action;
}

export async function executePending(ctx: Ctx, pending: PendingRecord, override?: unknown): Promise<string[]> {
  if (pending.userId !== ctx.actor.userId) throw new ApiError(403, "FORBIDDEN");
  if (pending.status !== "pending" || pending.ttl * 1000 < Date.now()) throw new ApiError(410, "EXPIRED");

  if (pending.toolName === "propose_tickets_from_text") {
    const parsed = bulkProposalSchema.parse(override ?? pending.payload);
    const selected = parsed.tickets.filter((ticket) => ticket.include !== false).slice(0, 10);
    if (selected.length === 0) throw new ApiError(400, "VALIDATION");
    const ids: string[] = [];
    for (const ticket of selected) {
      const created = await createTicket(ctx, ticket);
      ids.push(created.ticket.ticketId);
    }
    await ctx.store.markPending(pending.actionId, "confirmed");
    await audit(ctx, {
      action: "ai.action_confirmed",
      outcome: "allowed",
      toolName: pending.toolName,
      resourceType: "pending_action",
      resourceId: pending.actionId,
      projectId: pending.projectId,
      reason: `count:${ids.length}`,
    });
    return ids;
  }

  const payload = pending.payload;
  let resourceId = "";
  if (pending.toolName === "propose_create_ticket") {
    const created = await createTicket(ctx, payload as never);
    resourceId = created.ticket.ticketId;
  } else if (pending.toolName === "propose_edit_ticket") {
    const edited = await editTicket(ctx, String(payload.ticketId), payload);
    resourceId = edited.ticket.ticketId;
  } else if (pending.toolName === "propose_comment") {
    const comment = await addComment(ctx, String(payload.ticketId), String(payload.body ?? ""));
    resourceId = comment.comment.commentId;
  } else if (pending.toolName === "propose_status_change") {
    const ticket = await changeStatus(ctx, String(payload.ticketId), payload.status as Status, Number(payload.version));
    resourceId = ticket.ticketId;
  } else if (pending.toolName === "propose_delete_ticket") {
    await removeTicket(ctx, String(payload.ticketId), Number(payload.version));
    resourceId = String(payload.ticketId);
  } else {
    throw new ApiError(400, "VALIDATION");
  }

  await ctx.store.markPending(pending.actionId, "confirmed");
  await audit(ctx, {
    action: "ai.action_confirmed",
    outcome: "allowed",
    toolName: pending.toolName,
    resourceType: "pending_action",
    resourceId: pending.actionId,
    projectId: pending.projectId,
    reason: resourceId ? `resource:${resourceId}` : "confirmed",
  });
  return resourceId ? [resourceId] : [];
}

export async function actorFromUser(store: Store, user: UserRecord, tier: Tier): Promise<Actor> {
  const projectIds = await store.memberProjectIds(user.userId);
  return {
    userId: user.userId,
    tier,
    name: user.name,
    jobTitle: user.jobTitle,
    projectIds,
    preferredLanguage: user.preferredLanguage,
    previousSeenAt: user.previousSeenAt,
    email: user.email,
  };
}
