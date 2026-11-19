import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { Channel, Language, Priority, Status, TicketType, Tier } from "@mops/shared";
import { ApiError } from "../http.js";

export interface UserRecord {
  userId: string;
  email: string;
  name: string;
  jobTitle: string;
  tier: Tier;
  status: "active" | "disabled";
  lastSeenAt?: string;
  previousSeenAt?: string;
  preferredLanguage: Language;
  aiCallsDay?: string;
  aiCallsCount?: number;
  passwordHash: string;
  totpSecret?: string;
  failedLogins: number;
  lockedUntil?: string;
  mustChangePassword: boolean;
}

export interface ProjectRecord {
  projectId: string;
  name: string;
  key: string;
  isSandbox: boolean;
  nextNumber: number;
}

export interface TicketRecord {
  projectId: string;
  ticketId: string;
  title: string;
  description: string;
  type: TicketType;
  status: Status;
  priority: Priority;
  assigneeId?: string;
  reporterId: string;
  labels: string[];
  acceptanceCriteria: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  createdVia: Channel;
}

export interface CommentRecord {
  ticketId: string;
  sk: string;
  commentId: string;
  authorId: string;
  body: string;
  createdAt: string;
  createdVia: Channel;
}

export interface AuditRecord {
  day: string;
  sk: string;
  eventId: string;
  timestamp: string;
  actorUserId: string;
  actorTier: Tier;
  channel: Channel;
  action: string;
  resourceType: string;
  resourceId: string;
  projectId: string;
  outcome: "allowed" | "denied" | "error";
  toolName: string;
  conversationId: string;
  requestId: string;
  reason: string;
  latencyMs?: number;
  promptChars?: number;
  promptHash?: string;
}

export interface PendingRecord {
  actionId: string;
  userId: string;
  toolName: string;
  payload: Record<string, unknown>;
  status: "pending" | "confirmed" | "rejected" | "expired";
  conversationId: string;
  createdAt: string;
  ttl: number;
  projectId: string;
  resourceId: string;
}

type Row = Record<string, unknown>;

export function openDatabase(filePath: string): Database.Database {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "schema.sql");
  db.exec(readFileSync(schemaPath, "utf8"));
  return db;
}

export class Store {
  constructor(private readonly db: Database.Database) {}

  async getUser(userId: string): Promise<UserRecord | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE user_id = ?").get(userId) as Row | undefined;
    return row ? mapUser(row) : null;
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as Row | undefined;
    return row ? mapUser(row) : null;
  }

  async createUser(user: UserRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO users (
        user_id, email, name, job_title, tier, password_hash, totp_secret, failed_logins, locked_until,
        must_change_password, status, last_seen_at, previous_seen_at, preferred_language, ai_calls_day, ai_calls_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      user.userId,
      user.email.toLowerCase(),
      user.name,
      user.jobTitle,
      user.tier,
      user.passwordHash,
      user.totpSecret ?? null,
      user.failedLogins,
      user.lockedUntil ?? null,
      user.mustChangePassword ? 1 : 0,
      user.status,
      user.lastSeenAt ?? null,
      user.previousSeenAt ?? null,
      user.preferredLanguage,
      user.aiCallsDay ?? null,
      user.aiCallsCount ?? 0,
    );
  }

  async putUser(user: UserRecord): Promise<void> {
    this.db.prepare(
      `UPDATE users SET
        email = ?, name = ?, job_title = ?, tier = ?, totp_secret = COALESCE(?, totp_secret),
        failed_logins = ?, locked_until = ?, must_change_password = ?, status = ?,
        last_seen_at = ?, previous_seen_at = ?, preferred_language = ?, ai_calls_day = ?, ai_calls_count = ?,
        password_hash = COALESCE(?, password_hash)
       WHERE user_id = ?`,
    ).run(
      user.email.toLowerCase(),
      user.name,
      user.jobTitle,
      user.tier,
      user.totpSecret ?? null,
      user.failedLogins,
      user.lockedUntil ?? null,
      user.mustChangePassword ? 1 : 0,
      user.status,
      user.lastSeenAt ?? null,
      user.previousSeenAt ?? null,
      user.preferredLanguage,
      user.aiCallsDay ?? null,
      user.aiCallsCount ?? 0,
      user.passwordHash || null,
      user.userId,
    );
  }

  async listUsers(): Promise<UserRecord[]> {
    const rows = this.db.prepare("SELECT * FROM users ORDER BY name").all() as Row[];
    return rows.map(mapUser);
  }

  async touchSeen(user: UserRecord): Promise<UserRecord> {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE users SET last_seen_at = ?, previous_seen_at = ? WHERE user_id = ?").run(now, user.lastSeenAt ?? now, user.userId);
    return { ...user, previousSeenAt: user.lastSeenAt, lastSeenAt: now };
  }

  async consumeAiCall(userId: string, cap: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const user = await this.getUser(userId);
    if (!user) throw new ApiError(403, "FORBIDDEN");
    const count = user.aiCallsDay === today ? (user.aiCallsCount ?? 0) : 0;
    if (count >= cap) throw new ApiError(429, "AI_CAP");
    this.db.prepare("UPDATE users SET ai_calls_day = ?, ai_calls_count = ? WHERE user_id = ?").run(today, count + 1, userId);
  }

  async getProject(projectId: string): Promise<ProjectRecord | null> {
    const row = this.db.prepare("SELECT * FROM projects WHERE project_id = ?").get(projectId) as Row | undefined;
    return row ? mapProject(row) : null;
  }

  async putProject(project: ProjectRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO projects (project_id, name, key, is_sandbox, next_number) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET name = excluded.name, key = excluded.key, is_sandbox = excluded.is_sandbox, next_number = excluded.next_number`,
    ).run(project.projectId, project.name, project.key, project.isSandbox ? 1 : 0, project.nextNumber);
  }

  async allocateTicketNumber(projectId: string): Promise<number> {
    this.db.prepare("UPDATE projects SET next_number = next_number + 1 WHERE project_id = ?").run(projectId);
    const row = this.db.prepare("SELECT next_number FROM projects WHERE project_id = ?").get(projectId) as { next_number: number };
    return row.next_number;
  }

  async memberProjectIds(userId: string): Promise<string[]> {
    const rows = this.db.prepare("SELECT project_id FROM project_members WHERE user_id = ?").all(userId) as { project_id: string }[];
    return rows.map((row) => row.project_id);
  }

  async listMembers(projectId: string): Promise<{ userId: string; addedAt: string }[]> {
    const rows = this.db.prepare("SELECT user_id, added_at FROM project_members WHERE project_id = ?").all(projectId) as Row[];
    return rows.map((row) => ({ userId: String(row.user_id), addedAt: String(row.added_at) }));
  }

  async setMember(projectId: string, userId: string, member: boolean): Promise<void> {
    if (member) {
      this.db.prepare(
        "INSERT INTO project_members (project_id, user_id, added_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
      ).run(projectId, userId, new Date().toISOString());
      return;
    }
    this.db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").run(projectId, userId);
  }

  async projectsByIds(ids: string[]): Promise<ProjectRecord[]> {
    if (ids.length === 0) return [];
    const marks = ids.map(() => "?").join(",");
    const rows = this.db.prepare(`SELECT * FROM projects WHERE project_id IN (${marks})`).all(...ids) as Row[];
    return rows.map(mapProject);
  }

  async listTickets(projectId: string): Promise<TicketRecord[]> {
    const rows = this.db.prepare("SELECT * FROM tickets WHERE project_id = ?").all(projectId) as Row[];
    return rows.map(mapTicket);
  }

  async getTicket(projectId: string, ticketId: string): Promise<TicketRecord | null> {
    const row = this.db.prepare("SELECT * FROM tickets WHERE project_id = ? AND ticket_id = ?").get(projectId, ticketId) as Row | undefined;
    return row ? mapTicket(row) : null;
  }

  async putTicket(ticket: TicketRecord): Promise<void> {
    this.writeTicket(ticket);
  }

  async updateTicket(ticket: TicketRecord, expectedVersion: number): Promise<TicketRecord> {
    const next = { ...ticket, version: expectedVersion + 1, updatedAt: new Date().toISOString() };
    const result = this.db.prepare(
      `UPDATE tickets SET title=?, description=?, type=?, status=?, priority=?, assignee_id=?, labels=?, acceptance_criteria=?, updated_at=?, version=?, created_via=?
       WHERE project_id=? AND ticket_id=? AND version=?`,
    ).run(
      next.title,
      next.description,
      next.type,
      next.status,
      next.priority,
      next.assigneeId ?? null,
      JSON.stringify(next.labels),
      next.acceptanceCriteria,
      next.updatedAt,
      next.version,
      next.createdVia,
      next.projectId,
      next.ticketId,
      expectedVersion,
    );
    if (result.changes === 0) throw new ApiError(409, "CONFLICT");
    return next;
  }

  async deleteTicket(projectId: string, ticketId: string, expectedVersion: number): Promise<void> {
    const result = this.db.prepare("DELETE FROM tickets WHERE project_id = ? AND ticket_id = ? AND version = ?").run(projectId, ticketId, expectedVersion);
    if (result.changes === 0) throw new ApiError(409, "CONFLICT");
  }

  async ticketsForAssignee(assigneeId: string): Promise<TicketRecord[]> {
    const rows = this.db.prepare("SELECT * FROM tickets WHERE assignee_id = ?").all(assigneeId) as Row[];
    return rows.map(mapTicket);
  }

  async listComments(ticketId: string): Promise<CommentRecord[]> {
    const rows = this.db.prepare("SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at").all(ticketId) as Row[];
    return rows.map(mapComment);
  }

  async putComment(comment: CommentRecord): Promise<void> {
    this.db.prepare(
      "INSERT INTO comments (comment_id, ticket_id, author_id, body, created_at, created_via) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(comment.commentId, comment.ticketId, comment.authorId, comment.body, comment.createdAt, comment.createdVia);
  }

  async putAudit(event: AuditRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO audit_log (
        event_id, timestamp, actor_user_id, actor_tier, channel, action, resource_type, resource_id, project_id,
        outcome, tool_name, conversation_id, request_id, reason, latency_ms, prompt_chars, prompt_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      event.eventId,
      event.timestamp,
      event.actorUserId,
      event.actorTier,
      event.channel,
      event.action,
      event.resourceType,
      event.resourceId,
      event.projectId,
      event.outcome,
      event.toolName,
      event.conversationId,
      event.requestId,
      event.reason,
      event.latencyMs ?? null,
      event.promptChars ?? null,
      event.promptHash ?? null,
    );
  }

  async queryAudit(day: string): Promise<AuditRecord[]> {
    const rows = this.db.prepare("SELECT * FROM audit_log WHERE timestamp LIKE ? ORDER BY timestamp").all(`${day}%`) as Row[];
    return rows.map(mapAudit);
  }

  async putPending(action: PendingRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO pending_actions (action_id, user_id, tool_name, payload, status, conversation_id, created_at, expires_at, project_id, resource_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      action.actionId,
      action.userId,
      action.toolName,
      JSON.stringify(action.payload),
      action.status,
      action.conversationId,
      action.createdAt,
      new Date(action.ttl * 1000).toISOString(),
      action.projectId,
      action.resourceId,
    );
  }

  async getPending(actionId: string): Promise<PendingRecord | null> {
    const row = this.db.prepare("SELECT * FROM pending_actions WHERE action_id = ?").get(actionId) as Row | undefined;
    return row ? mapPending(row) : null;
  }

  async markPending(actionId: string, status: PendingRecord["status"]): Promise<void> {
    const result = this.db.prepare("UPDATE pending_actions SET status = ? WHERE action_id = ? AND status = 'pending'").run(status, actionId);
    if (result.changes === 0) throw new ApiError(409, "CONFLICT");
  }

  createChallenge(userId: string): string {
    return this.insertSession(userId, "mfa", 5 * 60 * 1000);
  }

  consumeChallenge(rawId: string): string | null {
    const row = this.sessionRow(rawId);
    this.db.prepare("DELETE FROM sessions WHERE session_hash = ?").run(hashSession(rawId));
    if (!row || row.kind !== "mfa" || Date.parse(String(row.expires_at)) < Date.now()) return null;
    return String(row.user_id);
  }

  createSession(userId: string): string {
    return this.insertSession(userId, "session", 8 * 60 * 60 * 1000);
  }

  readSession(rawId: string): { userId: string } | null {
    const row = this.sessionRow(rawId);
    if (!row || row.kind !== "session") return null;
    const now = Date.now();
    if (Date.parse(String(row.expires_at)) < now || now - Date.parse(String(row.last_seen_at)) > 30 * 60 * 1000) {
      this.db.prepare("DELETE FROM sessions WHERE session_hash = ?").run(hashSession(rawId));
      return null;
    }
    this.db.prepare("UPDATE sessions SET last_seen_at = ? WHERE session_hash = ?").run(new Date().toISOString(), hashSession(rawId));
    return { userId: String(row.user_id) };
  }

  deleteSession(rawId: string): void {
    this.db.prepare("DELETE FROM sessions WHERE session_hash = ?").run(hashSession(rawId));
  }

  private insertSession(userId: string, kind: string, ttlMs: number): string {
    const raw = randomUUID() + randomUUID();
    const now = new Date();
    this.db.prepare(
      "INSERT INTO sessions (session_hash, user_id, kind, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(hashSession(raw), userId, kind, now.toISOString(), now.toISOString(), new Date(now.getTime() + ttlMs).toISOString());
    return raw;
  }

  private sessionRow(rawId: string): Row | undefined {
    return this.db.prepare("SELECT * FROM sessions WHERE session_hash = ?").get(hashSession(rawId)) as Row | undefined;
  }

  private writeTicket(ticket: TicketRecord): void {
    this.db.prepare(
      `INSERT INTO tickets (
        ticket_id, project_id, title, description, type, status, priority, assignee_id, reporter_id, labels,
        acceptance_criteria, created_at, updated_at, version, created_via
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ticket.ticketId,
      ticket.projectId,
      ticket.title,
      ticket.description,
      ticket.type,
      ticket.status,
      ticket.priority,
      ticket.assigneeId ?? null,
      ticket.reporterId,
      JSON.stringify(ticket.labels),
      ticket.acceptanceCriteria,
      ticket.createdAt,
      ticket.updatedAt,
      ticket.version,
      ticket.createdVia,
    );
  }
}

function hashSession(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function mapUser(row: Row): UserRecord {
  return {
    userId: String(row.user_id),
    email: String(row.email),
    name: String(row.name),
    jobTitle: String(row.job_title),
    tier: row.tier as Tier,
    status: row.status as UserRecord["status"],
    lastSeenAt: optionalString(row.last_seen_at),
    previousSeenAt: optionalString(row.previous_seen_at),
    preferredLanguage: row.preferred_language as Language,
    aiCallsDay: optionalString(row.ai_calls_day),
    aiCallsCount: Number(row.ai_calls_count ?? 0),
    passwordHash: String(row.password_hash),
    totpSecret: optionalString(row.totp_secret),
    failedLogins: Number(row.failed_logins ?? 0),
    lockedUntil: optionalString(row.locked_until),
    mustChangePassword: Boolean(row.must_change_password),
  };
}

function mapProject(row: Row): ProjectRecord {
  return {
    projectId: String(row.project_id),
    name: String(row.name),
    key: String(row.key),
    isSandbox: Boolean(row.is_sandbox),
    nextNumber: Number(row.next_number),
  };
}

function mapTicket(row: Row): TicketRecord {
  return {
    projectId: String(row.project_id),
    ticketId: String(row.ticket_id),
    title: String(row.title),
    description: String(row.description),
    type: row.type as TicketType,
    status: row.status as Status,
    priority: row.priority as Priority,
    assigneeId: optionalString(row.assignee_id),
    reporterId: String(row.reporter_id),
    labels: JSON.parse(String(row.labels)) as string[],
    acceptanceCriteria: String(row.acceptance_criteria),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
    createdVia: row.created_via as Channel,
  };
}

function mapComment(row: Row): CommentRecord {
  const createdAt = String(row.created_at);
  const commentId = String(row.comment_id);
  return {
    ticketId: String(row.ticket_id),
    sk: `${createdAt}#${commentId}`,
    commentId,
    authorId: String(row.author_id),
    body: String(row.body),
    createdAt,
    createdVia: row.created_via as Channel,
  };
}

function mapAudit(row: Row): AuditRecord {
  const timestamp = String(row.timestamp);
  return {
    day: timestamp.slice(0, 10),
    sk: `${timestamp}#${row.event_id}`,
    eventId: String(row.event_id),
    timestamp,
    actorUserId: String(row.actor_user_id),
    actorTier: row.actor_tier as Tier,
    channel: row.channel as Channel,
    action: String(row.action),
    resourceType: String(row.resource_type),
    resourceId: String(row.resource_id),
    projectId: String(row.project_id),
    outcome: row.outcome as AuditRecord["outcome"],
    toolName: String(row.tool_name),
    conversationId: String(row.conversation_id),
    requestId: String(row.request_id),
    reason: String(row.reason),
    latencyMs: row.latency_ms == null ? undefined : Number(row.latency_ms),
    promptChars: row.prompt_chars == null ? undefined : Number(row.prompt_chars),
    promptHash: optionalString(row.prompt_hash),
  };
}

function mapPending(row: Row): PendingRecord {
  return {
    actionId: String(row.action_id),
    userId: String(row.user_id),
    toolName: String(row.tool_name),
    payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
    status: row.status as PendingRecord["status"],
    conversationId: String(row.conversation_id),
    createdAt: String(row.created_at),
    ttl: Math.floor(Date.parse(String(row.expires_at)) / 1000),
    projectId: String(row.project_id),
    resourceId: String(row.resource_id),
  };
}

function optionalString(value: unknown): string | undefined {
  return value == null || value === "" ? undefined : String(value);
}
