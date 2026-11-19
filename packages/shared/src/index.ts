import { z } from "zod";

/** Unicode code points, not bytes. Limits in the PRD are character counts. */
export function charLength(value: string): number {
  return Array.from(value).length;
}

export const TIERS = ["T1", "T2", "T3"] as const;
export const STATUSES = ["todo", "in_progress", "blocked", "in_review", "done"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const TICKET_TYPES = ["bug", "story", "task"] as const;
export const LANGUAGES = ["en", "zh-TW"] as const;
export const CHANNELS = ["ui", "ai"] as const;

export type Tier = (typeof TIERS)[number];
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type TicketType = (typeof TICKET_TYPES)[number];
export type Language = (typeof LANGUAGES)[number];
export type Channel = (typeof CHANNELS)[number];

export const ERROR_CODES = [
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION",
  "RATE_LIMIT",
  "GUARDRAIL_BLOCKED",
  "AI_CAP",
  "EXPIRED",
  "LOCKED",
  "MFA_INVALID",
  "PASSWORD_CHANGE_REQUIRED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const limited = (max: number) =>
  z.string().refine((value) => charLength(value) <= max, { message: "too_long" });

export const languageSchema = z.enum(LANGUAGES);
export const statusSchema = z.enum(STATUSES);
export const prioritySchema = z.enum(PRIORITIES);
export const ticketTypeSchema = z.enum(TICKET_TYPES);

export const ticketWriteSchema = z.object({
  projectId: z.string().min(1).max(40),
  title: limited(200),
  description: limited(5000),
  type: ticketTypeSchema,
  priority: prioritySchema,
  assigneeId: z.string().min(1).max(80).optional(),
  labels: z.array(limited(40)).max(8).optional(),
  acceptanceCriteria: limited(2000).optional(),
});

export const ticketPatchSchema = ticketWriteSchema
  .omit({ projectId: true })
  .partial()
  .extend({ version: z.number().int().positive() });

export const statusChangeSchema = z.object({
  status: statusSchema,
  version: z.number().int().positive(),
});

export const commentSchema = z.object({
  body: limited(2000),
});

export const chatSchema = z.object({
  message: z.string().refine((value) => charLength(value) > 0 && charLength(value) <= 4000, {
    message: "message_length",
  }),
  notes: z
    .string()
    .refine((value) => charLength(value) <= 10000, { message: "notes_length" })
    .optional(),
  conversationId: z.string().min(1).max(80).optional(),
});

export const proposalTicketSchema = z.object({
  include: z.boolean().optional(),
  projectId: z.string().min(1).max(40),
  title: limited(200),
  description: limited(5000),
  type: ticketTypeSchema,
  priority: prioritySchema,
  assigneeId: z.string().min(1).max(80).optional(),
  acceptanceCriteria: limited(2000).optional(),
});

export const bulkProposalSchema = z.object({
  tickets: z.array(proposalTicketSchema).min(1).max(10),
});

export const languagePatchSchema = z.object({
  preferredLanguage: languageSchema,
});

export const passwordSchema = z.string().refine((value) => charLength(value) >= 12 && charLength(value) <= 200, {
  message: "password_length",
});

export const loginSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(200),
});

export const mfaSchema = z.object({
  challengeId: z.string().min(16).max(80),
  code: z.string().regex(/^\d{6}$/),
});

export const passwordChangeSchema = z.object({
  password: passwordSchema,
});

export const adminUserSchema = z.object({
  email: z.string().email().max(120),
  name: limited(80),
  jobTitle: limited(80),
  tier: z.enum(TIERS),
  preferredLanguage: languageSchema.optional(),
});

export const adminUserPatchSchema = z.object({
  jobTitle: limited(80).optional(),
  tier: z.enum(TIERS).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  preferredLanguage: languageSchema.optional(),
});

export const membershipSchema = z.object({
  userId: z.string().min(1).max(80),
  member: z.boolean(),
});
