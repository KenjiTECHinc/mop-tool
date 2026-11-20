import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const snapshot = { ...process.env };

const validEnv = {
  AWS_REGION: "ap-southeast-2",
  AWS_PROFILE: "",
  APP_ROLE_ARN: "",
  SESSION_SECRET: "test-session-secret-value",
  TOTP_KEY: "test-totp-key-value-ok",
  AWS_BEARER_TOKEN_BEDROCK: "unit-test-bedrock-key",
  BEDROCK_MODEL_ID: "test-model",
  GUARDRAIL_ID: "",
  GUARDRAIL_VERSION: "",
};

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

async function load(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...validEnv, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { loadConfig } = await import("./config.js");
  return loadConfig();
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("loadConfig Bedrock API key", () => {
  it("requires a non-empty AWS_BEARER_TOKEN_BEDROCK and ignores OpenAI settings", async () => {
    const config = await load({
      AWS_BEARER_TOKEN_BEDROCK: "  unit-test-bedrock-key  ",
      OPENAI_API_KEY: "should-not-matter",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
    });
    expect(config.AWS_BEARER_TOKEN_BEDROCK).toBe("unit-test-bedrock-key");
    expect(config.BEDROCK_MODEL_ID).toBe("test-model");
    expect(config.AWS_REGION).toBe("ap-southeast-2");
    expect(config).not.toHaveProperty("OPENAI_API_KEY");
    expect(config).not.toHaveProperty("OPENAI_BASE_URL");
  });

  it("names AWS_BEARER_TOKEN_BEDROCK when the key is missing or blank", async () => {
    await expect(load({ AWS_BEARER_TOKEN_BEDROCK: undefined })).rejects.toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
    await expect(load({ AWS_BEARER_TOKEN_BEDROCK: "   " })).rejects.toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
    await expect(load({ AWS_BEARER_TOKEN_BEDROCK: "" })).rejects.toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
  });

  it("does not put the API key in the validation error", async () => {
    await expect(load({ BEDROCK_MODEL_ID: "" })).rejects.toThrow(/BEDROCK_MODEL_ID/);
    try {
      await load({ BEDROCK_MODEL_ID: "" });
    } catch (error) {
      expect(error instanceof Error ? error.message : "").not.toContain("unit-test-bedrock-key");
    }
  });
});

describe("Bedrock key stays server-side", () => {
  it("keeps .env untracked and out of the web app, package manifests, and the connectivity check", () => {
    const example = readFileSync(join(repoRoot, ".env.example"), "utf8");
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    const infra = readFileSync(join(repoRoot, "infra/README.md"), "utf8");
    const prd = readFileSync(join(repoRoot, "artifacts/PRD-v1-1.md"), "utf8");
    const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
    const check = readFileSync(join(repoRoot, "scripts/check-aws.ts"), "utf8");
    const apiPackage = readFileSync(join(repoRoot, "apps/api/package.json"), "utf8");
    const rootPackage = readFileSync(join(repoRoot, "package.json"), "utf8");
    const web = walk(join(repoRoot, "apps/web/src")).map((path) => readFileSync(path, "utf8")).join("\n");

    expect(example).toContain("AWS_BEARER_TOKEN_BEDROCK=");
    expect(example).not.toContain("OPENAI_");
    expect(readme).toContain("AWS_BEARER_TOKEN_BEDROCK");
    expect(readme).toContain("SEC-4");
    expect(readme).toContain("gitleaks");
    expect(infra).toContain("bedrock:CallWithBearerToken");
    expect(infra).toContain("bedrock-mantle:CallWithBearerToken");
    expect(infra).toContain("bearerTokenType");
    expect(infra).toContain("iam:CreateServiceSpecificCredential");
    expect(infra).toContain("iam:ServiceSpecificCredentialAgeDays");
    expect(infra).toContain("gitleaks");
    expect(prd).toContain("AWS_BEARER_TOKEN_BEDROCK");
    expect(gitignore).toMatch(/^\.env$/m);
    expect(check).toContain("AWS_BEARER_TOKEN_BEDROCK");
    expect(check).not.toContain("STSClient");
    expect(check).not.toContain("GetCallerIdentity");
    expect(check).not.toContain("OPENAI_");
    expect(apiPackage).not.toContain("openai");
    expect(rootPackage).not.toContain("openai");
    expect(web).not.toContain("AWS_BEARER_TOKEN_BEDROCK");
    expect(web).not.toContain("OPENAI_");
  });
});
