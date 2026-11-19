import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { DEMO_PASSWORD_WARNING, randomDemoPassword, resolveSeedPassword } from "./seed-password.js";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

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
  OPENAI_BASE_URL: "https://bedrock-mantle.ap-southeast-2.api.aws/v1",
  OPENAI_API_KEY: "test-key",
  BEDROCK_MODEL_ID: "openai.gpt-oss-120b",
  AWS_PROFILE: "",
  APP_ROLE_ARN: "",
};

async function runSeed(env: NodeJS.ProcessEnv) {
  return execFileAsync("npx", ["tsx", "scripts/seed.ts"], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });
}

describe("npm run seed password modes", () => {
  it("logs in every non-admin seeded user with DEMO_PASSWORD and does not require a password change", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mops-seed-fixed-"));
    const databasePath = join(dir, "mops.sqlite");
    const { stdout, stderr } = await runSeed({
      ...baseEnv,
      DATABASE_PATH: databasePath,
      AUDIT_LOG_PATH: join(dir, "audit.log"),
      DEMO_PASSWORD: "123456789012",
    });
    expect(`${stdout}\n${stderr}`).toContain(DEMO_PASSWORD_WARNING);
    expect(stdout).toContain("ada.admin@mops.example  123456789012");
    expect(stdout).toContain("sam.lee@mops.example  123456789012");

    process.env.DATABASE_PATH = databasePath;
    process.env.AUDIT_LOG_PATH = join(dir, "audit.log");
    process.env.SESSION_SECRET = baseEnv.SESSION_SECRET;
    process.env.TOTP_KEY = baseEnv.TOTP_KEY;
    process.env.OPENAI_BASE_URL = baseEnv.OPENAI_BASE_URL;
    process.env.OPENAI_API_KEY = baseEnv.OPENAI_API_KEY;
    process.env.BEDROCK_MODEL_ID = baseEnv.BEDROCK_MODEL_ID;
    process.env.AWS_PROFILE = "";
    process.env.APP_ROLE_ARN = "";

    const { loadConfig } = await import("../config.js");
    const { createBedrock } = await import("../aws.js");
    const { buildApp } = await import("../app.js");
    const config = loadConfig();
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
    expect(ada.json().mfaRequired).toBe(true);
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
    const { stdout, stderr } = await runSeed(env);
    expect(`${stdout}\n${stderr}`).not.toContain(DEMO_PASSWORD_WARNING);
    const lines = stdout
      .split("\n")
      .filter((line) => line.includes("@mops.example"));
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
      }),
    ).rejects.toThrow(/DEMO_PASSWORD must be 12 to 200 characters \(got 5\)/);
    const { existsSync } = await import("node:fs");
    expect(existsSync(databasePath)).toBe(false);
  });
});
