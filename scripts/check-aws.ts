import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { createBedrock } from "../apps/api/src/aws.js";

loadDotenv({ path: resolve(process.cwd(), ".env") });

const region = process.env.AWS_REGION ?? "";
const modelId = process.env.BEDROCK_MODEL_ID ?? "";
const token = process.env.AWS_BEARER_TOKEN_BEDROCK ?? "";
const missing = [
  ["AWS_BEARER_TOKEN_BEDROCK", token],
  ["AWS_REGION", region],
  ["BEDROCK_MODEL_ID", modelId],
]
  .filter(([, value]) => !value.trim())
  .map(([name]) => name);

if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

// Bedrock API keys cannot call STS. Always use the bearer client, even if an
// IAM profile is also present in the environment.
const client = createBedrock({ AWS_REGION: region, AWS_PROFILE: undefined, APP_ROLE_ARN: "" });

try {
  const result = await client.send(
    new ConverseCommand({
      modelId,
      messages: [{ role: "user", content: [{ text: "Reply with the single word ok." }] }],
      inferenceConfig: { maxTokens: 8 },
    }),
  );
  console.log(`bedrock converse stopReason=${result.stopReason ?? "unknown"} region=${region} model=${modelId}`);
  console.log("check:aws did not call STS");
} catch (error) {
  console.error(safeError(error, token));
  process.exit(1);
}

function safeError(error: unknown, secret: string): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : "bedrock converse failed";
  const redacted = secret ? message.split(secret).join("[REDACTED]") : message;
  return redacted.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}
