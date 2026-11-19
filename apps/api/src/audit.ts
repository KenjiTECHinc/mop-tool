import { appendFileSync, mkdirSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { Channel, Tier } from "@mops/shared";
import type { AppConfig } from "./config.js";
import type { AuditRecord, Store } from "./db/sqlite.js";
import { dayKey } from "./http.js";

export interface AuditInput {
  actorUserId: string;
  actorTier: Tier;
  channel: Channel;
  action: string;
  resourceType?: string;
  resourceId?: string;
  projectId?: string;
  outcome: AuditRecord["outcome"];
  toolName?: string;
  conversationId?: string;
  requestId: string;
  reason?: string;
  latencyMs?: number;
  promptChars?: number;
  promptHash?: string;
}

/** Audit rows are metadata only. Callers must not pass titles, descriptions, comments, or prompts. */
export async function recordAudit(store: Store, config: AppConfig, input: AuditInput): Promise<void> {
  const timestamp = new Date().toISOString();
  const eventId = randomUUID();
  const event: AuditRecord = {
    day: dayKey(),
    sk: `${timestamp}#${eventId}`,
    eventId,
    timestamp,
    actorUserId: input.actorUserId,
    actorTier: input.actorTier,
    channel: input.channel,
    action: input.action,
    resourceType: input.resourceType ?? "",
    resourceId: input.resourceId ?? "",
    projectId: input.projectId ?? "",
    outcome: input.outcome,
    toolName: input.toolName ?? "",
    conversationId: input.conversationId ?? "",
    requestId: input.requestId,
    reason: input.reason ?? "",
    latencyMs: input.latencyMs,
    promptChars: input.promptChars,
    promptHash: input.promptHash,
  };
  await store.putAudit(event);
  mkdirSync(dirname(config.AUDIT_LOG_PATH), { recursive: true });
  appendFileSync(config.AUDIT_LOG_PATH, `${JSON.stringify(event)}\n`);
}

export function promptFingerprint(text: string, key: string): { promptChars: number; promptHash: string } {
  return {
    promptChars: Array.from(text).length,
    promptHash: createHmac("sha256", key).update(text).digest("hex").slice(0, 16),
  };
}
