import { ApplyGuardrailCommand, type BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { AppConfig } from "../config.js";

/** Guardrails are best-effort. Authorization and confirmation remain the hard controls. */
export async function screenText(
  client: BedrockRuntimeClient,
  config: AppConfig,
  text: string,
  source: "INPUT" | "OUTPUT",
): Promise<boolean> {
  if (!config.GUARDRAIL_ID || !text.trim()) return false;
  const result = await client.send(
    new ApplyGuardrailCommand({
      guardrailIdentifier: config.GUARDRAIL_ID,
      guardrailVersion: config.GUARDRAIL_VERSION || "DRAFT",
      source,
      content: [{ text: { text: text.slice(0, 10000) } }],
    }),
  );
  return result.action === "GUARDRAIL_INTERVENED";
}
