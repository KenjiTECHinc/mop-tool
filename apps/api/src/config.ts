import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

/** Directory of the nearest .env, so data paths stay stable when npm runs this package from apps/api. */
function envAnchor(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, ".env"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const anchor = envAnchor();
loadDotenv({ path: resolve(anchor, ".env") });

function anchored(value: string): string {
  return isAbsolute(value) ? value : resolve(anchor, value);
}

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
  return {
    ...parsed.data,
    DATABASE_PATH: anchored(parsed.data.DATABASE_PATH),
    AUDIT_LOG_PATH: anchored(parsed.data.AUDIT_LOG_PATH),
  };
}
