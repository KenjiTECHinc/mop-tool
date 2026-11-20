import { authenticator } from "otplib";
import type { AppConfig } from "../config.js";
import type { UserRecord } from "../db/sqlite.js";
import { decryptSecret } from "./crypto.js";

export const DEMO_TOTP_BYPASS_WARNING =
  "WARNING: DEMO_TOTP_BYPASS is set. The code 000000 is accepted as a T1 one-time code. Local demo only — do not use this in a real deployment.";

export function warnDemoTotpBypass(enabled: boolean): void {
  if (enabled) console.warn(DEMO_TOTP_BYPASS_WARNING);
}

/** True when the code matches the user's authenticator, or the demo bypass is explicitly on. */
export function totpCodeAccepted(config: AppConfig, user: UserRecord, code: string): boolean {
  if (config.DEMO_TOTP_BYPASS && code === "000000") return true;
  if (!user.totpSecret) return false;
  try {
    const secret = decryptSecret(user.totpSecret, config.TOTP_KEY);
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}
