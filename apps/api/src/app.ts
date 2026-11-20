import { randomUUID } from "node:crypto";
import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { authenticator } from "otplib";
import {
  adminUserPatchSchema,
  adminUserSchema,
  loginSchema,
  mfaSchema,
  passwordChangeSchema,
  chatSchema,
  commentSchema,
  languagePatchSchema,
  membershipSchema,
  statusChangeSchema,
  ticketPatchSchema,
  ticketWriteSchema,
  type Tier,
} from "@mops/shared";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from "./auth/crypto.js";
import type { AppConfig } from "./config.js";
import { Store, type UserRecord, openDatabase } from "./db/sqlite.js";
import { ApiError, dayKey } from "./http.js";
import { recordAudit } from "./audit.js";
import { runChat, type UiEvent } from "./ai/orchestrator.js";
import {
  actorFromUser,
  addComment,
  audit,
  changeStatus,
  createTicket,
  editTicket,
  briefingPack,
  executePending,
  loadTicket,
  removeTicket,
  visibleProjects,
  type Actor,
  type Ctx,
} from "./services.js";

interface Access {
  userId: string;
  tier: Tier;
  profile: UserRecord;
  actor: Actor;
}

declare module "fastify" {
  interface FastifyRequest {
    access?: Access;
  }
}

function parse<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new ApiError(400, "VALIDATION");
  }
}

const COOKIE = "mops_session";
const PUBLIC = new Set(["/health", "/auth/login", "/auth/mfa/verify"]);

export async function buildApp(config: AppConfig, bedrock: BedrockRuntimeClient): Promise<FastifyInstance> {
  const store = new Store(openDatabase(config.DATABASE_PATH));

  const app = Fastify({
    logger: { level: "info", redact: ["req.headers.authorization", "req.headers.cookie", "req.body"] },
    genReqId: () => randomUUID(),
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
    allowedHeaders: ["content-type", "x-mops-request"],
  });

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (request.method !== "GET" && request.method !== "HEAD" && request.headers["x-mops-request"] !== "1") {
      return reply.code(403).send({ code: "FORBIDDEN" });
    }
    if (PUBLIC.has(path)) return;
    const raw = request.cookies[COOKIE];
    const session = raw ? store.readSession(raw) : null;
    if (!session) return reply.code(401).send({ code: "AUTH_REQUIRED" });
    const profile = await store.getUser(session.userId);
    if (!profile || profile.status === "disabled") return reply.code(403).send({ code: "FORBIDDEN" });
    if (profile.mustChangePassword && path !== "/auth/password" && path !== "/auth/logout" && path !== "/me") {
      return reply.code(403).send({ code: "PASSWORD_CHANGE_REQUIRED" });
    }
    const actor = await actorFromUser(store, profile, profile.tier);
    request.access = { userId: profile.userId, tier: profile.tier, profile, actor };
  });

  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: (request: FastifyRequest) => request.access?.userId ?? request.ip,
    errorResponseBuilder: () => ({ code: "RATE_LIMIT" }),
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const err = error instanceof Error ? error : new Error("unknown");
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send({ code: err.code });
    }
    if (err.name === "ZodError") {
      return reply.code(400).send({ code: "VALIDATION" });
    }
    const statusCode = "statusCode" in err && typeof err.statusCode === "number" ? err.statusCode : 500;
    if (statusCode === 429) return reply.code(429).send({ code: "RATE_LIMIT" });
    request.log.error({ name: err.name, requestId: request.id });
    return reply.code(statusCode >= 400 && statusCode < 500 ? statusCode : 500).send({ code: "INTERNAL" });
  });

  app.get("/health", async () => ({ ok: true }));

  app.post("/auth/login", async (request, reply) => {
    const body = parse(loginSchema, request.body);
    const user = await store.getUserByEmail(body.email);
    if (!user || user.status === "disabled") {
      return reply.code(401).send({ code: "AUTH_REQUIRED" });
    }
    if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
      return reply.code(423).send({ code: "LOCKED" });
    }
    const ok = await verifyPassword(user.passwordHash, body.password);
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lockedUntil = failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : undefined;
      await store.putUser({ ...user, failedLogins: failed >= 5 ? 0 : failed, lockedUntil });
      await recordFailed(store, config, user, request.id, failed >= 5 ? "locked" : "bad_password");
      return reply.code(401).send({ code: failed >= 5 ? "LOCKED" : "AUTH_REQUIRED" });
    }
    await store.putUser({ ...user, failedLogins: 0, lockedUntil: undefined });
    if (user.tier === "T1") {
      const challengeId = store.createChallenge(user.userId);
      return { mfaRequired: true, challengeId };
    }
    setSession(reply, store.createSession(user.userId));
    await recordLogin(store, config, user, request.id);
    return { ok: true, passwordChangeRequired: user.mustChangePassword };
  });

  app.post("/auth/mfa/verify", async (request, reply) => {
    const body = parse(mfaSchema, request.body);
    const userId = store.consumeChallenge(body.challengeId);
    const user = userId ? await store.getUser(userId) : null;
    if (!user || !user.totpSecret) return reply.code(401).send({ code: "MFA_INVALID" });
    const secret = decryptSecret(user.totpSecret, config.TOTP_KEY);
    const valid = authenticator.check(body.code, secret);
    if (!valid) {
      await recordFailed(store, config, user, request.id, "bad_totp");
      return reply.code(401).send({ code: "MFA_INVALID" });
    }
    setSession(reply, store.createSession(user.userId));
    await recordLogin(store, config, user, request.id);
    return { ok: true, passwordChangeRequired: user.mustChangePassword };
  });

  app.post("/auth/logout", async (request, reply) => {
    const raw = request.cookies[COOKIE];
    if (raw) store.deleteSession(raw);
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.post("/auth/password", async (request) => {
    const access = request.access;
    if (!access) throw new ApiError(401, "AUTH_REQUIRED");
    const body = parse(passwordChangeSchema, request.body);
    const passwordHash = await hashPassword(body.password);
    await store.putUser({ ...access.profile, passwordHash, mustChangePassword: false });
    return { ok: true };
  });

  const ctxFor = (request: FastifyRequest, channel: "ui" | "ai" = "ui"): Ctx => {
    const access = request.access;
    if (!access) throw new ApiError(401, "AUTH_REQUIRED");
    return {
      store,
      config,
      actor: access.actor,
      requestId: request.id,
      channel,
    };
  };

  app.get("/me", async (request) => {
    const access = request.access;
    if (!access) throw new ApiError(401, "AUTH_REQUIRED");
    const touched = await store.touchSeen(access.profile);
    access.actor.previousSeenAt = touched.previousSeenAt;
    const ctx = ctxFor(request);
    const projects = await visibleProjects(ctx);
    return {
      user: publicUser(touched),
      tier: access.tier,
      preferredLanguage: touched.preferredLanguage,
      projects,
    };
  });

  app.patch("/me", async (request) => {
    const access = request.access;
    if (!access) throw new ApiError(401, "AUTH_REQUIRED");
    const body = parse(languagePatchSchema, request.body);
    const next = { ...access.profile, preferredLanguage: body.preferredLanguage };
    await store.putUser(next);
    return { preferredLanguage: next.preferredLanguage };
  });

  app.get("/projects", async (request) => {
    return { projects: await visibleProjects(ctxFor(request)) };
  });

  app.get("/projects/:id/members", async (request) => {
    const ctx = ctxFor(request);
    const params = request.params as { id: string };
    const project = (await visibleProjects(ctx)).find((item) => item.projectId === params.id);
    if (!project) throw new ApiError(403, "FORBIDDEN");
    const members = await store.listMembers(project.projectId);
    const people = [];
    for (const member of members) {
      const user = await store.getUser(member.userId);
      if (user) people.push({ userId: user.userId, name: user.name, jobTitle: user.jobTitle, tier: user.tier });
    }
    return { members: people };
  });

  app.get("/projects/:id/tickets", async (request) => {
    const ctx = ctxFor(request);
    const params = request.params as { id: string };
    const query = request.query as Record<string, string | undefined>;
    const project = (await visibleProjects(ctx)).find((item) => item.projectId === params.id);
    if (!project) {
      const hidden = await store.getProject(params.id);
      if (hidden) await audit(ctx, { action: "authz.denied", outcome: "denied", projectId: params.id, resourceId: params.id, reason: "ticket_list" });
      throw new ApiError(hidden ? 403 : 404, hidden ? "FORBIDDEN" : "NOT_FOUND");
    }
    let tickets = await store.listTickets(project.projectId);
    if (query.status) tickets = tickets.filter((ticket) => ticket.status === query.status);
    if (query.assigneeId) tickets = tickets.filter((ticket) => ticket.assigneeId === query.assigneeId);
    if (query.priority) tickets = tickets.filter((ticket) => ticket.priority === query.priority);
    if (query.type) tickets = tickets.filter((ticket) => ticket.type === query.type);
    if (query.q) tickets = tickets.filter((ticket) => ticket.title.toLowerCase().includes(query.q!.toLowerCase()));
    const sort = query.sort ?? "updatedAt";
    tickets.sort((a, b) => String(b[sort as keyof typeof b] ?? "").localeCompare(String(a[sort as keyof typeof a] ?? "")));
    return { tickets };
  });

  app.get("/tickets/:id", async (request) => {
    const ctx = ctxFor(request);
    const params = request.params as { id: string };
    const ticket = await loadTicket(ctx, params.id, "ticket.read");
    const comments = await store.listComments(ticket.ticketId);
    return { ticket, comments };
  });

  app.post("/tickets", async (request, reply) => {
    const result = await createTicket(ctxFor(request), parse(ticketWriteSchema, request.body));
    return reply.code(201).send(result);
  });

  app.patch("/tickets/:id", async (request) => {
    const params = request.params as { id: string };
    const body = parse(ticketPatchSchema, request.body);
    return editTicket(ctxFor(request), params.id, body);
  });

  app.delete("/tickets/:id", async (request) => {
    const params = request.params as { id: string };
    const body = request.body as { version?: number };
    if (!body?.version) throw new ApiError(400, "VALIDATION");
    await removeTicket(ctxFor(request), params.id, body.version);
    return { ok: true };
  });

  app.post("/tickets/:id/status", async (request) => {
    const params = request.params as { id: string };
    const body = parse(statusChangeSchema, request.body);
    return { ticket: await changeStatus(ctxFor(request), params.id, body.status, body.version) };
  });

  app.post("/tickets/:id/comments", async (request, reply) => {
    const params = request.params as { id: string };
    const body = parse(commentSchema, request.body);
    const result = await addComment(ctxFor(request), params.id, body.body);
    return reply.code(201).send(result);
  });

  const aiLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/ai/chat", aiLimit, async (request, reply) => {
    const body = parse(chatSchema, request.body);
    const ctx = ctxFor(request, "ai");
    await store.consumeAiCall(ctx.actor.userId, config.AI_DAILY_CAP);
    await writeSse(reply, config.CORS_ORIGIN, async (emit) => {
      await runChat({
        ctx,
        config,
        bedrock,
        message: body.message,
        notes: body.notes,
        conversationId: body.conversationId ?? randomUUID(),
        hmacKey: config.SESSION_SECRET,
        emit,
      });
    });
  });

  app.get("/ai/briefing", aiLimit, async (request) => {
    const ctx = ctxFor(request, "ai");
    await store.consumeAiCall(ctx.actor.userId, config.AI_DAILY_CAP);
    return { briefing: await briefingPack(ctx) };
  });

  app.post("/ai/actions/:id/confirm", async (request) => {
    const ctx = ctxFor(request, "ai");
    const params = request.params as { id: string };
    const pending = await store.getPending(params.id);
    if (!pending || pending.userId !== ctx.actor.userId) throw new ApiError(404, "NOT_FOUND");
    const ids = await executePending(ctx, pending, request.body && Object.keys(request.body as object).length ? request.body : undefined);
    return { ok: true, ids };
  });

  app.post("/ai/actions/:id/reject", async (request) => {
    const ctx = ctxFor(request, "ai");
    const params = request.params as { id: string };
    const pending = await store.getPending(params.id);
    if (!pending || pending.userId !== ctx.actor.userId) throw new ApiError(404, "NOT_FOUND");
    if (pending.ttl * 1000 < Date.now()) throw new ApiError(410, "EXPIRED");
    await store.markPending(pending.actionId, "rejected");
    await audit(ctx, {
      action: "ai.action_rejected",
      outcome: "allowed",
      toolName: pending.toolName,
      resourceId: pending.actionId,
      projectId: pending.projectId,
      reason: "rejected",
    });
    return { ok: true };
  });

  app.get("/admin/users", async (request) => {
    await requireAdmin(ctxFor(request));
    const users = await store.listUsers();
    return { users: users.map(publicUser) };
  });

  app.post("/admin/users", async (request, reply) => {
    const ctx = ctxFor(request);
    await requireAdmin(ctx);
    const body = parse(adminUserSchema, request.body);
    const temporaryPassword = `Mops-${randomUUID().slice(0, 8)}aA1!`;
    const userId = randomUUID();
    const totpPlain = body.tier === "T1" ? authenticator.generateSecret() : "";
    const profile: UserRecord = {
      userId,
      email: body.email,
      name: body.name,
      jobTitle: body.jobTitle,
      tier: body.tier,
      status: "active",
      preferredLanguage: body.preferredLanguage ?? "en",
      passwordHash: await hashPassword(temporaryPassword),
      failedLogins: 0,
      mustChangePassword: true,
      totpSecret: totpPlain ? encryptSecret(totpPlain, config.TOTP_KEY) : undefined,
    };
    await store.createUser(profile);
    await audit(ctx, { action: "user.create", outcome: "allowed", resourceType: "user", resourceId: userId, reason: body.tier });
    return reply.code(201).send({
      user: publicUser(profile),
      temporaryPassword,
      totpUri: totpPlain ? authenticator.keyuri(body.email, "Mops", totpPlain) : undefined,
    });
  });

  app.patch("/admin/users/:id", async (request) => {
    const ctx = ctxFor(request);
    await requireAdmin(ctx);
    const params = request.params as { id: string };
    const body = parse(adminUserPatchSchema, request.body);
    const user = await store.getUser(params.id);
    if (!user) throw new ApiError(404, "NOT_FOUND");
    const next = { ...user, ...body, tier: body.tier ?? user.tier, status: body.status ?? user.status };
    await store.putUser(next);
    await audit(ctx, { action: "user.update", outcome: "allowed", resourceType: "user", resourceId: user.userId, reason: body.tier ?? body.status ?? "profile" });
    return { user: publicUser(next) };
  });

  app.put("/admin/projects/:id/members", async (request) => {
    const ctx = ctxFor(request);
    await requireAdmin(ctx);
    const params = request.params as { id: string };
    const body = parse(membershipSchema, request.body);
    const project = await store.getProject(params.id);
    const user = await store.getUser(body.userId);
    if (!project || !user) throw new ApiError(404, "NOT_FOUND");
    if (project.isSandbox && user.tier !== "T1") throw new ApiError(403, "FORBIDDEN");
    if (!project.isSandbox && user.tier === "T1") throw new ApiError(403, "FORBIDDEN");
    await store.setMember(project.projectId, user.userId, body.member);
    await audit(ctx, {
      action: "membership.update",
      outcome: "allowed",
      resourceType: "membership",
      resourceId: user.userId,
      projectId: project.projectId,
      reason: body.member ? "add" : "remove",
    });
    return { ok: true };
  });

  app.get("/admin/audit", async (request) => {
    const ctx = ctxFor(request);
    await requireAdmin(ctx);
    const query = request.query as Record<string, string | undefined>;
    const day = query.date || dayKey();
    let events = await store.queryAudit(day);
    if (query.actor) events = events.filter((event) => event.actorUserId === query.actor);
    if (query.action) events = events.filter((event) => event.action === query.action);
    if (query.outcome) events = events.filter((event) => event.outcome === query.outcome);
    return { events };
  });

  app.get("/admin/metrics", async (request) => {
    const ctx = ctxFor(request);
    await requireAdmin(ctx);
    const events = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      events.push(...(await store.queryAudit(date)));
    }
    const proposed = events.filter((event) => event.action === "ai.action_proposed").length;
    const confirmed = events.filter((event) => event.action === "ai.action_confirmed").length;
    const rejected = events.filter((event) => event.action === "ai.action_rejected").length;
    const aiEdits = events.filter((event) => event.action === "ticket.update" && event.reason === "ai_origin").length;
    const aiCreates = events.filter((event) => event.action === "ticket.create" && event.reason === "origin:ai").length;
    const latencies = events.map((event) => event.latencyMs).filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
    const actors = new Set(events.map((event) => event.actorUserId));
    const aiEvents = events.filter((event) => event.channel === "ai" || event.action.startsWith("ai.")).length;
    return {
      acceptanceRate: proposed === 0 ? 0 : confirmed / proposed,
      editRate: aiCreates === 0 ? 0 : aiEdits / aiCreates,
      wrongActionRate: proposed === 0 ? 0 : (rejected + aiEdits) / proposed,
      denied: events.filter((event) => event.action === "authz.denied").length,
      guardrailBlocks: events.filter((event) => event.action === "ai.guardrail_blocked").length,
      medianLatencyMs: latencies.length === 0 ? 0 : latencies[Math.floor(latencies.length / 2)],
      weeklyActiveUsers: actors.size,
      aiUsageShare: events.length === 0 ? 0 : aiEvents / events.length,
    };
  });

  app.post("/admin/ai/insights", aiLimit, async (request, reply) => {
    const ctx = ctxFor(request, "ai");
    await requireAdmin(ctx);
    const body = parse(chatSchema, request.body ?? { message: "Summarize unusual activity this week." });
    await store.consumeAiCall(ctx.actor.userId, config.AI_DAILY_CAP);
    await writeSse(reply, config.CORS_ORIGIN, async (emit) => {
      await runChat({
        ctx,
        config,
        bedrock,
        message: body.message,
        conversationId: body.conversationId ?? `insights-${ctx.actor.userId}`,
        hmacKey: config.SESSION_SECRET,
        emit,
      });
    });
  });

  return app;
}

async function requireAdmin(ctx: Ctx): Promise<void> {
  if (ctx.actor.tier !== "T1") {
    await audit(ctx, { action: "authz.denied", outcome: "denied", reason: "admin" });
    throw new ApiError(403, "FORBIDDEN");
  }
}

function publicUser(user: UserRecord) {
  return {
    userId: user.userId,
    email: user.email,
    name: user.name,
    jobTitle: user.jobTitle,
    tier: user.tier,
    status: user.status,
    preferredLanguage: user.preferredLanguage,
    lastSeenAt: user.lastSeenAt ?? null,
    mustChangePassword: user.mustChangePassword,
  };
}

function setSession(reply: FastifyReply, raw: string): void {
  reply.setCookie(COOKIE, raw, { httpOnly: true, sameSite: "strict", path: "/", secure: false });
}

async function recordLogin(store: Store, config: AppConfig, user: UserRecord, requestId: string): Promise<void> {
  await recordAudit(store, config, {
    actorUserId: user.userId,
    actorTier: user.tier,
    channel: "ui",
    action: "auth.login",
    outcome: "allowed",
    requestId,
    reason: "session",
  });
}

async function recordFailed(store: Store, config: AppConfig, user: UserRecord, requestId: string, reason: string): Promise<void> {
  await recordAudit(store, config, {
    actorUserId: user.userId,
    actorTier: user.tier,
    channel: "ui",
    action: "auth.login",
    outcome: "denied",
    requestId,
    reason,
  });
}

async function writeSse(reply: FastifyReply, origin: string, run: (emit: (event: UiEvent) => void) => Promise<void>): Promise<void> {
  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  const emit = (event: UiEvent) => {
    reply.raw.write(`event: block\ndata: ${JSON.stringify(event)}\n\n`);
  };
  try {
    await run(emit);
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "INTERNAL";
    emit({ type: "error", code });
  }
  reply.raw.write("event: done\ndata: {}\n\n");
  reply.raw.end();
}
