import { describe, expect, it, vi } from "vitest";
import { DEMO_TOTP_BYPASS_WARNING, warnDemoTotpBypass } from "./demo-totp.js";

describe("DEMO_TOTP_BYPASS startup warning", () => {
  it("warns only when the bypass is on", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnDemoTotpBypass(false);
    expect(warn).not.toHaveBeenCalled();
    warnDemoTotpBypass(true);
    expect(warn).toHaveBeenCalledWith(DEMO_TOTP_BYPASS_WARNING);
    warn.mockRestore();
  });
});
