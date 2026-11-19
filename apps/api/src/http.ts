import type { ErrorCode } from "@mops/shared";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
  ) {
    super(code);
  }
}

export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function projectIdFromTicket(ticketId: string): string | null {
  const mark = ticketId.lastIndexOf("-");
  if (mark <= 0) return null;
  return ticketId.slice(0, mark).toLowerCase();
}
