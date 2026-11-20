import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
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
});
