import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env") });

const region = (process.env.AWS_REGION ?? "").trim();
const modelId = (process.env.BEDROCK_MODEL_ID ?? "").trim();
const rawToken = process.env.AWS_BEARER_TOKEN_BEDROCK ?? "";
const token = rawToken.trim();
const missing = [
  ["AWS_BEARER_TOKEN_BEDROCK", token],
  ["AWS_REGION", region],
  ["BEDROCK_MODEL_ID", modelId],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

// The SDK reads AWS_BEARER_TOKEN_BEDROCK. Set the trimmed value before the client is built.
process.env.AWS_BEARER_TOKEN_BEDROCK = token;

const client = new BedrockRuntimeClient({
  region,
  authSchemePreference: ["httpBearerAuth"],
});

try {
  const result = await client.send(
    new ConverseCommand({
      modelId,
      messages: [{ role: "user", content: [{ text: "Reply with the single word ok." }] }],
      inferenceConfig: { maxTokens: 16 },
    }),
  );
  const reply = (result.output?.message?.content ?? [])
    .map((block) => ("text" in block ? block.text ?? "" : ""))
    .join("");
  console.log(`bedrock converse stopReason=${result.stopReason ?? "unknown"} region=${region} model=${modelId}`);
  console.log(reply.trim());
} catch (error) {
  console.error(safeError(error, rawToken, token));
  console.error("requestId:", (error as any)?.$metadata?.requestId);
  process.exit(1);
}

function safeError(error: unknown, ...secrets: string[]): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : "bedrock converse failed";
  return secrets
    .map((secret) => secret.trim())
    .filter((secret) => secret.length > 0)
    .reduce((text, secret) => text.split(secret).join("[redacted]"), message);
}
