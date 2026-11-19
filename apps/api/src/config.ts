import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), "../../.env") });

const schema = z.object({
  AWS_REGION: z.string().min(1).default("ap-southeast-2"),
  AWS_PROFILE: z.string().optional(),
  APP_ROLE_ARN: z.string().optional().default(""),
  SESSION_SECRET: z.string().min(16),
  TOTP_KEY: z.string().min(16),
  DATABASE_PATH: z.string().min(1).default("data/mops.sqlite"),
  AUDIT_LOG_PATH: z.string().min(1).default("data/audit.log"),
  OPENAI_BASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  BEDROCK_MODEL_ID: z.string().min(1),
  GUARDRAIL_ID: z.string().optional().default(""),
  GUARDRAIL_VERSION: z.string().optional().default(""),
  AI_MAX_TOKENS: z.coerce.number().int().positive().max(2000).default(800),
  AI_DAILY_CAP: z.coerce.number().int().positive().default(40),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".") || issue.message);
    throw new Error(`Missing or invalid environment. Fill these in .env before starting the API: ${missing.join(", ")}`);
  }
  if (parsed.data.OPENAI_BASE_URL.includes("api.openai.com")) {
    throw new Error("OPENAI_BASE_URL must be the Bedrock Mantle host, not api.openai.com.");
  }
  return parsed.data;
}
