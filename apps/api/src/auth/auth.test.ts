import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authenticator } from "otplib";
import { beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "mops-auth-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.AUDIT_LOG_PATH = join(dir, "audit.log");
process.env.SESSION_SECRET = "test-session-secret-value";
process.env.TOTP_KEY = "test-totp-key-value-ok";
process.env.AWS_BEARER_TOKEN_BEDROCK ??= "test-bedrock-token";
process.env.BEDROCK_MODEL_ID ??= "test-model";

const { hashPassword, encryptSecret } = await import("./crypto.js");
const { openDatabase, Store } = await import("../db/sqlite.js");
const { loadConfig } = await import("../config.js");
const { createBedrock } = await import("../aws.js");
const { buildApp } = await import("../app.js");

const config = loadConfig();
const db = openDatabase(config.DATABASE_PATH);
const store = new Store(db);
const password = "correct-horse-1";

beforeAll(async () => {
  await store.createUser({
    userId: "dev-1",
    email: "dev@mops.example",
    name: "Dev",
    jobTitle: "Developer",
    tier: "T3",
    status: "active",
    preferredLanguage: "en",
    passwordHash: await hashPassword(password),
    failedLogins: 0,
    mustChangePassword: false,
  });
  await store.createUser({
    userId: "admin-1",
    email: "admin@mops.example",
    name: "Ada",
    jobTitle: "Admin/IT",
    tier: "T1",
    status: "active",
    preferredLanguage: "en",
    passwordHash: await hashPassword(password),
    failedLogins: 0,
    mustChangePassword: false,
  });
});

describe("local auth", () => {
  it("locks the account after five failed passwords", async () => {
    const app = await buildApp(config, createBedrock(config));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "x-mops-request": "1" },
        payload: { email: "dev@mops.example", password: "wrong-password-1" },
      });
      expect(response.statusCode).toBe(401);
    }
    const locked = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-mops-request": "1" },
      payload: { email: "dev@mops.example", password: "wrong-password-1" },
    });
    expect(locked.json()).toEqual({ code: "LOCKED" });
    await app.close();
  });

  it("rejects a logged-out session and an idle-expired session", async () => {
    const app = await buildApp(config, createBedrock(config));
    const fresh = new Store(openDatabase(config.DATABASE_PATH));
    await fresh.putUser({ ...(await fresh.getUser("dev-1"))!, failedLogins: 0, lockedUntil: undefined });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-mops-request": "1" },
      payload: { email: "dev@mops.example", password },
    });
    const cookie = cookieHeader(login);
    expect(login.statusCode).toBe(200);
    const logout = await app.inject({ method: "POST", url: "/auth/logout", headers: { "x-mops-request": "1", cookie } });
    expect(logout.statusCode).toBe(200);
    const after = await app.inject({ method: "GET", url: "/me", headers: { cookie } });
    expect(after.statusCode).toBe(401);

    const again = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-mops-request": "1" },
      payload: { email: "dev@mops.example", password },
    });
    const live = cookieHeader(again);
    const raw = live.split("=")[1] ?? "";
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE session_hash != ''").run(new Date(Date.now() - 31 * 60 * 1000).toISOString());
    const stale = await app.inject({ method: "GET", url: "/me", headers: { cookie: live } });
    expect(stale.statusCode).toBe(401);
    expect(raw.length).toBeGreaterThan(16);
    await app.close();
  });

  it("blocks T1 until a valid one-time code is provided", async () => {
    const app = await buildApp({ ...config, DEMO_TOTP_BYPASS: false }, createBedrock(config));
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-mops-request": "1" },
      payload: { email: "admin@mops.example", password },
    });
    expect(login.statusCode).toBe(200);
    const body = login.json() as { mfaRequired: boolean; challengeId: string };
    expect(body.mfaRequired).toBe(true);
    expect(login.headers["set-cookie"]).toBeUndefined();
    const bad = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      headers: { "x-mops-request": "1" },
      payload: { challengeId: body.challengeId, code: "111111" },
    });
    expect(bad.statusCode).toBe(401);

    const secret = authenticator.generateSecret();
    const current = authenticator.generate(secret);
    const fresh = new Store(openDatabase(config.DATABASE_PATH));
    const admin = await fresh.getUser("admin-1");
    await fresh.putUser({ ...admin!, totpSecret: encryptSecret(secret, config.TOTP_KEY) });
    const challengeId = fresh.createChallenge("admin-1");
    if (current !== "000000") {
      const demo = await app.inject({
        method: "POST",
        url: "/auth/mfa/verify",
        headers: { "x-mops-request": "1" },
        payload: { challengeId, code: "000000" },
      });
      expect(demo.statusCode).toBe(401);
    }
    const good = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      headers: { "x-mops-request": "1" },
      payload: { challengeId: fresh.createChallenge("admin-1"), code: current },
    });
    expect(good.statusCode).toBe(200);
    const issued = setCookie(good);
    expect(issued).toContain("HttpOnly");
    expect(issued.toLowerCase()).toContain("samesite=strict");
    await app.close();
  });

  it("accepts 000000 only when DEMO_TOTP_BYPASS is on", async () => {
    db.prepare("UPDATE users SET totp_secret = NULL WHERE user_id = 'admin-1'").run();
    const off = await buildApp({ ...config, DEMO_TOTP_BYPASS: false }, createBedrock(config));
    const offChallenge = new Store(openDatabase(config.DATABASE_PATH)).createChallenge("admin-1");
    const rejected = await off.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      headers: { "x-mops-request": "1" },
      payload: { challengeId: offChallenge, code: "000000" },
    });
    expect(rejected.statusCode).toBe(401);
    await off.close();

    const on = await buildApp({ ...config, DEMO_TOTP_BYPASS: true }, createBedrock(config));
    const wrong = await on.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      headers: { "x-mops-request": "1" },
      payload: { challengeId: new Store(openDatabase(config.DATABASE_PATH)).createChallenge("admin-1"), code: "111111" },
    });
    expect(wrong.statusCode).toBe(401);
    const accepted = await on.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      headers: { "x-mops-request": "1" },
      payload: { challengeId: new Store(openDatabase(config.DATABASE_PATH)).createChallenge("admin-1"), code: "000000" },
    });
    expect(accepted.statusCode).toBe(200);
    expect(setCookie(accepted)).toContain("HttpOnly");
    await on.close();
  });
});

describe("cors", () => {
  it("allows PATCH on the /me preflight", async () => {
    const app = await buildApp(config, createBedrock(config));
    const response = await app.inject({
      method: "OPTIONS",
      url: "/me",
      headers: {
        origin: config.CORS_ORIGIN,
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type,x-mops-request",
      },
    });
    expect(response.statusCode).not.toBe(403);
    const allow = String(response.headers["access-control-allow-methods"] ?? "");
    expect(allow).toMatch(/PATCH/);
    expect(allow).toMatch(/PUT/);
    expect(allow).toMatch(/DELETE/);
    await app.close();
  });
});

describe("audit triggers", () => {
  it("rejects update and delete on the audit table", async () => {
    const local = new Store(db);
    await local.putAudit({
      day: "2026-01-01",
      sk: "x",
      eventId: "evt-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      actorUserId: "dev-1",
      actorTier: "T3",
      channel: "ui",
      action: "auth.login",
      resourceType: "",
      resourceId: "",
      projectId: "",
      outcome: "allowed",
      toolName: "",
      conversationId: "",
      requestId: "r1",
      reason: "session",
    });
    expect(() => db.prepare("UPDATE audit_log SET reason = 'changed' WHERE event_id = 'evt-1'").run()).toThrow(/audit_append_only/);
    expect(() => db.prepare("DELETE FROM audit_log WHERE event_id = 'evt-1'").run()).toThrow(/audit_append_only/);
  });
});

function setCookie(response: { headers: { "set-cookie"?: string | string[] | number } }): string {
  const raw = response.headers["set-cookie"];
  const line = Array.isArray(raw) ? raw[0] : raw;
  return line == null ? "" : String(line);
}

function cookieHeader(response: { headers: { "set-cookie"?: string | string[] | number } }): string {
  return setCookie(response).split(";")[0] ?? "";
}
