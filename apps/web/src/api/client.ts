import type { ChatBlock, Comment, Me, PendingView, Project, Ticket } from "../types.ts";

const base = import.meta.env.VITE_API_URL || "http://localhost:3001";

export class ApiClientError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("x-mops-request", "1");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${base}${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    throw new ApiClientError(body.code || "INTERNAL");
  }
  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ ok?: boolean; mfaRequired?: boolean; challengeId?: string; passwordChangeRequired?: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  verifyMfa: (challengeId: string, code: string) =>
    request<{ ok: boolean; passwordChangeRequired: boolean }>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId, code }),
    }),
  changePassword: (password: string) => request("/auth/password", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request<Me>("/me"),
  setLanguage: (preferredLanguage: "en" | "zh-TW") =>
    request("/me", { method: "PATCH", body: JSON.stringify({ preferredLanguage }) }),
  projects: () => request<{ projects: Project[] }>("/projects"),
  members: (projectId: string) => request<{ members: { userId: string; name: string }[] }>(`/projects/${projectId}/members`),
  tickets: (projectId: string, query: Record<string, string>) => {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value));
    return request<{ tickets: Ticket[] }>(`/projects/${projectId}/tickets?${params.toString()}`);
  },
  ticket: (id: string) => request<{ ticket: Ticket; comments: Comment[] }>(`/tickets/${id}`),
  createTicket: (body: unknown) => request<{ ticket: Ticket; redacted: boolean }>("/tickets", { method: "POST", body: JSON.stringify(body) }),
  updateTicket: (id: string, body: unknown) => request<{ ticket: Ticket }>(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTicket: (id: string, version: number) => request(`/tickets/${id}`, { method: "DELETE", body: JSON.stringify({ version }) }),
  status: (id: string, status: string, version: number) =>
    request(`/tickets/${id}/status`, { method: "POST", body: JSON.stringify({ status, version }) }),
  comment: (id: string, body: string) => request(`/tickets/${id}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
  users: () => request<{ users: Me["user"][] }>("/admin/users"),
  createUser: (body: unknown) => request<{ user: Me["user"]; temporaryPassword: string }>("/admin/users", { method: "POST", body: JSON.stringify(body) }),
  patchUser: (id: string, body: unknown) => request(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  membership: (projectId: string, userId: string, member: boolean) =>
    request(`/admin/projects/${projectId}/members`, { method: "PUT", body: JSON.stringify({ userId, member }) }),
  audit: (query: Record<string, string>) => request<{ events: AuditEvent[] }>(`/admin/audit?${new URLSearchParams(query).toString()}`),
  metrics: () => request<Metrics>("/admin/metrics"),
  confirm: (id: string, body?: unknown) => request(`/ai/actions/${id}/confirm`, { method: "POST", body: JSON.stringify(body ?? {}) }),
  reject: (id: string) => request(`/ai/actions/${id}/reject`, { method: "POST" }),
};

export interface AuditEvent {
  timestamp: string;
  actorUserId: string;
  action: string;
  outcome: string;
  projectId: string;
  resourceId: string;
  reason: string;
}

export interface Metrics {
  acceptanceRate: number;
  editRate: number;
  wrongActionRate: number;
  denied: number;
  guardrailBlocks: number;
  medianLatencyMs: number;
  weeklyActiveUsers: number;
  aiUsageShare: number;
}

export async function streamChat(
  path: string,
  body: { message: string; notes?: string; conversationId: string },
  onBlock: (block: ChatBlock) => void,
): Promise<void> {
  const headers = new Headers({ "content-type": "application/json", "x-mops-request": "1" });
  const response = await fetch(`${base}${path}`, { method: "POST", headers, credentials: "include", body: JSON.stringify(body) });
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as { code?: string };
    throw new ApiClientError(payload.code || "INTERNAL");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantId = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const data = part.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
      if (!data || data === "{}") continue;
      const event = JSON.parse(data) as { type: string; delta?: string; name?: string; code?: string; replace?: boolean; ticket?: ChatBlock & { kind: "ticket" }; action?: PendingView };
      if (event.type === "text" && event.delta) {
        if (!assistantId) {
          assistantId = crypto.randomUUID();
          onBlock({ id: assistantId, kind: "assistant", text: event.delta });
        } else {
          onBlock({ id: assistantId, kind: "assistant", text: event.delta });
        }
      } else if (event.type === "tool" && event.name) {
        assistantId = "";
        onBlock({ id: crypto.randomUUID(), kind: "assistant", text: "", tool: event.name });
      } else if (event.type === "ticket" && event.ticket) {
        onBlock({ id: crypto.randomUUID(), kind: "ticket", ticket: event.ticket as never });
      } else if (event.type === "confirmation" && event.action) {
        assistantId = "";
        onBlock({ id: event.action.actionId, kind: "confirmation", action: event.action });
      } else if (event.type === "proposal" && event.action) {
        assistantId = "";
        onBlock({ id: event.action.actionId, kind: "proposal", action: event.action });
      } else if (event.type === "notice") {
        onBlock({ id: crypto.randomUUID(), kind: "notice" });
      } else if (event.type === "error" && event.code) {
        if (event.replace) assistantId = "";
        onBlock({ id: crypto.randomUUID(), kind: "error", code: event.code });
      }
    }
  }
}
