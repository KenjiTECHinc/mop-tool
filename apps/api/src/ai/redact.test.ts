import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact.js";

describe("redactSecrets", () => {
  it("redacts an AWS access key in English notes", () => {
    const result = redactSecrets("Deploy failed. Key AKIAIOSFODNN7EXAMPLE was pasted.");
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result.text).toContain("[REDACTED]");
  });

  it("redacts a Chinese password line and leaves the ticket id", () => {
    const result = redactSecrets("工單 APOLLO-12 的密碼：hunter2 請勿外流");
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("hunter2");
    expect(result.text).toContain("APOLLO-12");
  });

  it("redacts a private key block and a bearer-like token", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----";
    const result = redactSecrets(`notes ${pem} password=swordfish`);
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("PRIVATE KEY");
    expect(result.text).not.toContain("swordfish");
  });

  it("does not redact ordinary ticket prose", () => {
    const result = redactSecrets("Mark APOLLO-12 as In Review. The PR is up.");
    expect(result.redacted).toBe(false);
    expect(result.text).toContain("APOLLO-12");
  });
});
