import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { authenticator } from "otplib";
import { describe, expect, it } from "vitest";
import { DEMO_PASSWORD_WARNING, randomDemoPassword, resolveSeedPassword } from "./seed-password.js";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const seedScript = join(repoRoot, "scripts", "seed.ts");

function seededPasswordLines(stdout: string): string[] {
  return stdout.split("\n").filter((line) => line.includes("@mops.example") && !line.includes("otpauth://"));
}

function expectStoredAsArgon2(databasePath: string, plaintext: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare("SELECT email, password_hash, must_change_password FROM users").all() as Array<{
      email: string;
      password_hash: string;
      must_change_password: number;
    }>;
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.must_change_password).toBe(0);
      expect(row.password_hash.startsWith("$argon2id$")).toBe(true);
      expect(row.password_hash).not.toContain(plaintext);
      expect(row.password_hash).not.toBe(plaintext);
    }
  } finally {
    db.close();
  }
}

describe("resolveSeedPassword", () => {
  it("keeps random generation when DEMO_PASSWORD is unset or empty", () => {
    expect(resolveSeedPassword(undefined)).toEqual({ kind: "random" });
    expect(resolveSeedPassword("")).toEqual({ kind: "random" });
  });

  it("uses a valid DEMO_PASSWORD for every seeded user", () => {
    expect(resolveSeedPassword("123456789012")).toEqual({ kind: "fixed", password: "123456789012" });
  });

  it("rejects a DEMO_PASSWORD shorter than 12 characters", () => {
    expect(() => resolveSeedPassword("12345678901")).toThrow(/DEMO_PASSWORD must be 12 to 200 characters \(got 11\)/);
  });

  it("rejects a DEMO_PASSWORD longer than 200 characters", () => {
    expect(() => resolveSeedPassword("a".repeat(201))).toThrow(/got 201/);
  });

  it("counts characters the same way as passwordSchema", () => {
    expect(() => resolveSeedPassword("😀".repeat(11))).toThrow(/got 11/);
    expect(resolveSeedPassword("😀".repeat(12))).toEqual({ kind: "fixed", password: "😀".repeat(12) });
  });
});

describe("randomDemoPassword", () => {
  it("matches the historical seed format and the 12 character minimum", () => {
    const password = randomDemoPassword();
    expect(password).toMatch(/^Mops-[0-9a-f]{6}aA1!$/);
    expect(password.length).toBeGreaterThanOrEqual(12);
  });
});

const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  TOTP_KEY: "test-totp-key-value-ok",
  SESSION_SECRET: "test-session-secret-value",
  AWS_BEARER_TOKEN_BEDROCK: "test-bedrock-token",
  BEDROCK_MODEL_ID: "test-model",
  AWS_PROFILE: "",
  APP_ROLE_ARN: "",
};

async function runSeed(env: NodeJS.ProcessEnv, cwd: string) {
  return execFileAsync(process.execPath, [tsxCli, seedScript], {
    cwd,
    env,
    encoding: "utf8",
  });
}

describe("demo password is configured, not hard-coded", () => {
  it("documents DEMO_PASSWORD and keeps the value out of the seed sources", () => {
    const example = readFileSync(join(repoRoot, ".env.example"), "utf8");
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    const infraReadme = readFileSync(join(repoRoot, "infra/README.md"), "utf8");
    const seedSource = readFileSync(join(repoRoot, "apps/api/src/seed-cli.ts"), "utf8");
    const helperSource = readFileSync(join(repoRoot, "apps/api/src/auth/seed-password.ts"), "utf8");
    const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");

    expect(example).toMatch(/^DEMO_PASSWORD=123456789012$/m);
    expect(example).toContain("Leave it empty");
    expect(readme).toContain("DEMO_PASSWORD");
    expect(readme).toContain("unset");
    expect(infraReadme).toContain("DEMO_PASSWORD");
    expect(infraReadme).toContain("unset");
    expect(seedSource).toContain("process.env.DEMO_PASSWORD");
    expect(seedSource).not.toContain("123456789012");
    expect(helperSource).not.toContain("123456789012");
    expect(gitignore).toMatch(/^\.env$/m);
  });
});

describe("npm run seed password modes", () => {
  it("logs in every seeded user with DEMO_PASSWORD from .env and stores an argon2id hash", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mops-seed-fixed-"));
    const databasePath = join(dir, "mops.sqlite");
    writeFileSync(join(dir, ".env"), "DEMO_PASSWORD=123456789012\n");
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      DATABASE_PATH: databasePath,
      AUDIT_LOG_PATH: join(dir, "audit.log"),
    };
    delete env.DEMO_PASSWORD;
    const { stdout, stderr } = await runSeed(env, dir);
    expect(`${stdout}\n${stderr}`).toContain(DEMO_PASSWORD_WARNING);
    const lines = seededPasswordLines(stdout);
    expect(lines).toHaveLength(6);
    for (const line of lines) expect(line.split(/\s+/)[1]).toBe("123456789012");
    expectStoredAsArgon2(databasePath, "123456789012");

    process.env.DATABASE_PATH = databasePath;
    process.env.AUDIT_LOG_PATH = join(dir, "audit.log");
    process.env.SESSION_SECRET = baseEnv.SESSION_SECRET;
    process.env.TOTP_KEY = baseEnv.TOTP_KEY;
    process.env.AWS_BEARER_TOKEN_BEDROCK = baseEnv.AWS_BEARER_TOKEN_BEDROCK;
    process.env.BEDROCK_MODEL_ID = baseEnv.BEDROCK_MODEL_ID;
    process.env.AWS_PROFILE = "";
    process.env.APP_ROLE_ARN = "";
    delete process.env.DEMO_TOTP_BYPASS;

    const { loadConfig } = await import("../config.js");
    const { createBedrock } = await import("../aws.js");
    const { buildApp } = await import("../app.js");
    const config = { ...(await loadConfig()), DEMO_TOTP_BYPASS: false };
    const app = await buildApp(config, createBedrock(config));
    for (const email of ["chris.chen@mops.example", "maya.chen@mops.example", "sam.lee@mops.example", "jordan.wu@mops.example", "riley.park@mops.example"]) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: { "x-mops-request": "1" },
        payload: { email, password: "123456789012" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, passwordChangeRequired: false });
    }
    const ada = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-mops-request": "1" },
      payload: { email: "ada.admin@mops.example", password: "123456789012" },
    });
    expect(ada.statusCode).toBe(200);
    const adaBody = ada.json() as { mfaRequired: boolean; challengeId: string };
    expect(adaBody.mfaRequired).toBe(true);
    const secretLine = stdout.split("\n").map((line) => line.trim()).find((line) => /^[A-Z2-7]+=*$/.test(line));
    expect(secretLine).toBeTruthy();
    const adaSecret = secretLine!;
    expect(stdout).toContain("otpauth://totp/");
    expect(stdout).toContain(adaSecret);
    const current = authenticator.generate(adaSecret);
    if (current !== "000000") {
      const wrong = await app.inject({
        method: "POST",
        url: "/auth/mfa/verify",
        headers: { "x-mops-request": "1" },
        payload: { challengeId: adaBody.challengeId, code: "000000" },
      });
      expect(wrong.statusCode).toBe(401);
    }
    const again = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-mops-request": "1" },
      payload: { email: "ada.admin@mops.example", password: "123456789012" },
    });
    const accepted = await app.inject({
      method: "POST",
      url: "/auth/mfa/verify",
      headers: { "x-mops-request": "1" },
      payload: { challengeId: (again.json() as { challengeId: string }).challengeId, code: authenticator.generate(adaSecret) },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ ok: true });
    const auditDb = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      const stored = auditDb.prepare("SELECT totp_secret FROM users WHERE email = ?").get("ada.admin@mops.example") as { totp_secret: string };
      expect(stored.totp_secret).toBeTruthy();
      expect(stored.totp_secret).not.toContain(adaSecret);
      const audits = JSON.stringify(auditDb.prepare("SELECT * FROM audit_log").all());
      expect(audits).not.toContain(adaSecret);
    } finally {
      auditDb.close();
    }
    const auditPath = join(dir, "audit.log");
    if (existsSync(auditPath)) expect(readFileSync(auditPath, "utf8")).not.toContain(adaSecret);
    await app.close();
  }, 60_000);

  it("prints a random password per user when DEMO_PASSWORD is unset", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mops-seed-random-"));
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      DATABASE_PATH: join(dir, "mops.sqlite"),
      AUDIT_LOG_PATH: join(dir, "audit.log"),
    };
    delete env.DEMO_PASSWORD;
    const { stdout, stderr } = await runSeed(env, dir);
    expect(`${stdout}\n${stderr}`).not.toContain(DEMO_PASSWORD_WARNING);
    const lines = seededPasswordLines(stdout);
    expect(lines).toHaveLength(6);
    const passwords = new Set(lines.map((line) => line.split(/\s+/)[1]));
    expect(passwords.size).toBe(6);
    for (const password of passwords) expect(password).toMatch(/^Mops-[0-9a-f]{6}aA1!$/);
  }, 60_000);

  it("prints a random password per user when DEMO_PASSWORD is empty", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mops-seed-empty-"));
    writeFileSync(join(dir, ".env"), "DEMO_PASSWORD=\n");
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      DATABASE_PATH: join(dir, "mops.sqlite"),
      AUDIT_LOG_PATH: join(dir, "audit.log"),
    };
    delete env.DEMO_PASSWORD;
    const { stdout, stderr } = await runSeed(env, dir);
    expect(`${stdout}\n${stderr}`).not.toContain(DEMO_PASSWORD_WARNING);
    const lines = seededPasswordLines(stdout);
    expect(lines).toHaveLength(6);
    const passwords = new Set(lines.map((line) => line.split(/\s+/)[1]));
    expect(passwords.size).toBe(6);
    for (const password of passwords) expect(password).toMatch(/^Mops-[0-9a-f]{6}aA1!$/);
  }, 60_000);

  it("fails before writing the database when DEMO_PASSWORD is shorter than 12 characters", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mops-seed-short-"));
    const databasePath = join(dir, "mops.sqlite");
    await expect(
      runSeed({
        ...baseEnv,
        DATABASE_PATH: databasePath,
        AUDIT_LOG_PATH: join(dir, "audit.log"),
        DEMO_PASSWORD: "short",
      }, dir),
    ).rejects.toThrow(/DEMO_PASSWORD must be 12 to 200 characters \(got 5\)/);
    expect(existsSync(databasePath)).toBe(false);
  });

  it("fails before writing the database when DEMO_PASSWORD is longer than 200 characters", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mops-seed-long-"));
    const databasePath = join(dir, "mops.sqlite");
    await expect(
      runSeed({
        ...baseEnv,
        DATABASE_PATH: databasePath,
        AUDIT_LOG_PATH: join(dir, "audit.log"),
        DEMO_PASSWORD: "a".repeat(201),
      }, dir),
    ).rejects.toThrow(/DEMO_PASSWORD must be 12 to 200 characters \(got 201\)/);
    expect(existsSync(databasePath)).toBe(false);
  });
});
