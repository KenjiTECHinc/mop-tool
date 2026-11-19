export interface Project {
  projectId: string;
  name: string;
  key: string;
  isSandbox: boolean;
}

export interface Ticket {
  projectId: string;
  ticketId: string;
  title: string;
  description: string;
  type: "bug" | "story" | "task";
  status: "todo" | "in_progress" | "blocked" | "in_review" | "done";
  priority: "low" | "medium" | "high" | "critical";
  assigneeId?: string;
  reporterId: string;
  labels: string[];
  acceptanceCriteria: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  createdVia: "ui" | "ai";
}

export interface Comment {
  commentId: string;
  authorId: string;
  body: string;
  createdAt: string;
  createdVia: "ui" | "ai";
}

export interface Me {
  user: {
    userId: string;
    email: string;
    name: string;
    jobTitle: string;
    tier: "T1" | "T2" | "T3";
    status: string;
    preferredLanguage: "en" | "zh-TW";
    mustChangePassword?: boolean;
  };
  tier: "T1" | "T2" | "T3";
  preferredLanguage: "en" | "zh-TW";
  projects: Project[];
}

export interface PendingView {
  actionId: string;
  toolName: string;
  payload: Record<string, unknown>;
}

export type ChatBlock =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string; tool?: string }
  | { id: string; kind: "ticket"; ticket: { ticketId: string; title: string; status: string; projectId: string } }
  | { id: string; kind: "confirmation"; action: PendingView }
  | { id: string; kind: "proposal"; action: PendingView }
  | { id: string; kind: "error"; code: string }
  | { id: string; kind: "notice" };
