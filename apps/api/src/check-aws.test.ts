import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";

const sentinel = "qa-check-aws-token-do-not-print";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function stubEnv(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

async function runCheck(): Promise<{ errors: string[]; logs: string[]; caught: unknown }> {
  const errors: string[] = [];
  const logs: string[] = [];
  vi.spyOn(console, "error").mockImplementation((message?: unknown) => {
    errors.push(String(message));
  });
  vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
    logs.push(String(message));
  });
  vi.spyOn(process, "exit").mockImplementation(((code?: number): never => {
    throw new Error(`exit:${code ?? 0}`);
  }) as typeof process.exit);
  let caught: unknown;
  try {
    await import("../../../scripts/check-aws.js");
  } catch (error) {
    caught = error;
  }
  return { errors, logs, caught };
}

describe("check-aws secret hygiene", () => {
  it("redacts the bearer token when the converse call fails", async () => {
    stubEnv({
      AWS_BEARER_TOKEN_BEDROCK: sentinel,
      AWS_REGION: "ap-southeast-2",
      BEDROCK_MODEL_ID: "test-model",
    });
    vi.spyOn(BedrockRuntimeClient.prototype, "send").mockRejectedValue(
      new Error(`Authorization: Bearer ${sentinel} rejected raw ${sentinel}`),
    );
    const { errors, logs, caught } = await runCheck();
    const output = [...errors, ...logs].join("\n");
    expect(caught).toMatchObject({ message: "exit:1" });
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain(sentinel);
  });

  it("does not print the token on a successful check", async () => {
    stubEnv({
      AWS_BEARER_TOKEN_BEDROCK: sentinel,
      AWS_REGION: "ap-southeast-2",
      BEDROCK_MODEL_ID: "test-model",
    });
    vi.spyOn(BedrockRuntimeClient.prototype, "send").mockResolvedValue({ stopReason: "end_turn" } as never);
    const success = await runCheck();
    expect(success.caught).toBeUndefined();
    expect(success.logs.join("\n")).toContain("stopReason=end_turn");
    expect([...success.logs, ...success.errors].join("\n")).not.toContain(sentinel);
  });

  it("does not print the token when a sibling env var is blank", async () => {
    stubEnv({
      AWS_BEARER_TOKEN_BEDROCK: sentinel,
      AWS_REGION: "   ",
      BEDROCK_MODEL_ID: "test-model",
    });
    const send = vi.spyOn(BedrockRuntimeClient.prototype, "send");
    const missing = await runCheck();
    expect(missing.caught).toMatchObject({ message: "exit:1" });
    expect(missing.errors.join("\n")).toContain("AWS_REGION");
    expect(missing.errors.join("\n")).not.toContain(sentinel);
    expect(send).not.toHaveBeenCalled();
  });

  it("normalizes a CRLF-padded token before the client is used and redacts both forms", async () => {
    const trimmed = "padded-bedrock-key";
    const raw = `  ${trimmed}\r\n`;
    stubEnv({
      AWS_BEARER_TOKEN_BEDROCK: raw,
      AWS_REGION: "ap-southeast-2",
      BEDROCK_MODEL_ID: "test-model",
    });
    vi.spyOn(BedrockRuntimeClient.prototype, "send").mockImplementation(async () => {
      expect(process.env.AWS_BEARER_TOKEN_BEDROCK).toBe(trimmed);
      throw new Error(`Authorization: Bearer ${raw} rejected ${trimmed}`);
    });
    const { errors, logs, caught } = await runCheck();
    const output = [...errors, ...logs].join("\n");
    expect(caught).toMatchObject({ message: "exit:1" });
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain(trimmed);
    expect(output).not.toContain(raw);
  });

  it("rejects a whitespace-only token without printing it", async () => {
    stubEnv({
      AWS_BEARER_TOKEN_BEDROCK: "   ",
      AWS_REGION: "ap-southeast-2",
      BEDROCK_MODEL_ID: "test-model",
    });
    const send = vi.spyOn(BedrockRuntimeClient.prototype, "send");
    const { errors, caught } = await runCheck();
    expect(caught).toMatchObject({ message: "exit:1" });
    expect(errors.join("\n")).toContain("AWS_BEARER_TOKEN_BEDROCK");
    expect(send).not.toHaveBeenCalled();
  });
});
