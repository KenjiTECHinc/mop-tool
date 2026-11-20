import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { describe, expect, it } from "vitest";
import { bedrockClientConfig, createBedrock, usesIamOverride } from "./aws.js";
import type { AppConfig } from "./config.js";

const token = "unit-test-bedrock-key";

function auth(overrides: Partial<AppConfig> = {}) {
  return {
    AWS_REGION: "ap-southeast-2",
    AWS_PROFILE: undefined,
    APP_ROLE_ARN: "",
    AWS_BEARER_TOKEN_BEDROCK: token,
    ...overrides,
  };
}

describe("createBedrock auth setup", () => {
  it("omits credentials and prefers the bearer scheme when no IAM override is set", () => {
    const config = auth();
    expect(usesIamOverride(config)).toBe(false);
    const options = bedrockClientConfig(config);
    expect(options.region).toBe("ap-southeast-2");
    expect(options).not.toHaveProperty("credentials");
    expect(options.authSchemePreference).toEqual(["httpBearerAuth"]);
    expect(JSON.stringify(options)).not.toContain(token);

    const client = createBedrock(config);
    expect(client).toBeInstanceOf(BedrockRuntimeClient);
    const seen = new WeakSet<object>();
    const dumped = JSON.stringify(client.config, (_key, value: unknown) => {
      if (typeof value === "function") return "[fn]";
      if (value && typeof value === "object") {
        if (seen.has(value)) return "[circular]";
        seen.add(value);
      }
      return value;
    });
    expect(dumped).not.toContain(token);
  });

  it("uses an explicit profile or role instead of the bearer scheme", () => {
    const profile = bedrockClientConfig(auth({ AWS_PROFILE: "mops-dev" }));
    expect(usesIamOverride(auth({ AWS_PROFILE: "mops-dev" }))).toBe(true);
    expect(profile.credentials).toEqual(expect.any(Function));
    expect(profile.authSchemePreference).toBeUndefined();

    const role = bedrockClientConfig(auth({ APP_ROLE_ARN: "arn:aws:iam::123456789012:role/MopsApiRole" }));
    expect(role.credentials).toEqual(expect.any(Function));
    expect(role.authSchemePreference).toBeUndefined();

    const both = bedrockClientConfig(
      auth({ AWS_PROFILE: "mops-dev", APP_ROLE_ARN: "arn:aws:iam::123456789012:role/MopsApiRole" }),
    );
    expect(both.credentials).toEqual(expect.any(Function));
    expect(JSON.stringify({ region: both.region, preference: both.authSchemePreference ?? null })).not.toContain(token);
  });

  it("treats blank profile and role as the bearer path", () => {
    const options = bedrockClientConfig(auth({ AWS_PROFILE: "", APP_ROLE_ARN: "" }));
    expect(options).not.toHaveProperty("credentials");
    expect(options.authSchemePreference).toEqual(["httpBearerAuth"]);
  });

  it("signs with the bearer env value even when ambient IAM keys are present", async () => {
    const previous = {
      AWS_BEARER_TOKEN_BEDROCK: process.env.AWS_BEARER_TOKEN_BEDROCK,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
    };
    process.env.AWS_BEARER_TOKEN_BEDROCK = token;
    process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
    process.env.AWS_SECRET_ACCESS_KEY = "ambient-secret-access-key";
    delete process.env.AWS_SESSION_TOKEN;
    try {
      const client = createBedrock(auth());
      await expect(client.config.authSchemePreference()).resolves.toEqual(["httpBearerAuth"]);
      const stop = {
        destroy() {},
        handle: async () => {
          throw new Error("stopped-before-network");
        },
      };
      const requestHandler = client.config.requestHandler as unknown;
      client.config.requestHandler = (typeof requestHandler === "function" ? async () => stop : stop) as typeof client.config.requestHandler;
      client.middlewareStack.add(
        (next) => async (args) => {
          const read = () => {
            const request = args.request as { headers?: Record<string, string> };
            return request.headers?.authorization ?? request.headers?.Authorization ?? "";
          };
          try {
            await next(args);
          } catch (error) {
            const header = read();
            if (header) throw new Error(`HEADER ${header}`, { cause: error });
            throw error;
          }
          const header = read();
          if (header) throw new Error(`HEADER ${header}`);
          throw new Error("authorization header was not set");
        },
        { step: "finalizeRequest", priority: "low", name: "captureBearerAuth" },
      );
      await expect(client.send(new ConverseCommand({
        modelId: "test-model",
        messages: [{ role: "user", content: [{ text: "hi" }] }],
      }))).rejects.toThrow(`HEADER Bearer ${token}`);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
