import { describe, expect, it } from "vitest";
import { installBedrockBearerToken, redactBearerValues } from "./bedrock-token.js";

describe("bedrock bearer token normalization", () => {
  it("redacts the raw padded value and the trimmed value", () => {
    const raw = "  padded-bedrock-key\r\n";
    const trimmed = raw.trim();
    const message = `header Bearer ${raw} core ${trimmed} tail`;
    const redacted = redactBearerValues(message, trimmed);
    expect(redacted).not.toContain(trimmed);
    expect(redacted).not.toContain(raw);
    expect(redacted).toContain("[REDACTED]");
  });

  it("installs only the trimmed key into the environment", () => {
    const previous = process.env.AWS_BEARER_TOKEN_BEDROCK;
    try {
      const installed = installBedrockBearerToken("  padded-bedrock-key\r\n");
      expect(installed).toBe("padded-bedrock-key");
      expect(process.env.AWS_BEARER_TOKEN_BEDROCK).toBe("padded-bedrock-key");
      expect(installBedrockBearerToken("   ")).toBe("");
      expect(process.env.AWS_BEARER_TOKEN_BEDROCK).toBe("padded-bedrock-key");
    } finally {
      if (previous === undefined) delete process.env.AWS_BEARER_TOKEN_BEDROCK;
      else process.env.AWS_BEARER_TOKEN_BEDROCK = previous;
    }
  });
});
