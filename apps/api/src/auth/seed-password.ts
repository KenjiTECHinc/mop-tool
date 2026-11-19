import { randomBytes } from "node:crypto";
import { charLength, passwordSchema } from "@mops/shared";

export const DEMO_PASSWORD_WARNING =
  "WARNING: DEMO_PASSWORD is set. Every seeded user shares this fixed password. Local demo only — do not use this in a real deployment.";

export type SeedPasswordPlan = { kind: "fixed"; password: string } | { kind: "random" };

/** Shared demo password from the environment, or a per-user random password when unset. */
export function resolveSeedPassword(raw: string | undefined): SeedPasswordPlan {
  if (raw === undefined || raw === "") return { kind: "random" };
  const parsed = passwordSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `DEMO_PASSWORD must be 12 to 200 characters (got ${charLength(raw)}). Seed aborted.`,
    );
  }
  return { kind: "fixed", password: parsed.data };
}

/** Same shape as the historical seed passwords: prefix, 6 hex chars, and a mixed suffix. */
export function randomDemoPassword(): string {
  return `Mops-${randomBytes(3).toString("hex")}aA1!`;
}
