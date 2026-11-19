import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="px-4 py-8 text-center">
      <b>{title}</b>
      <p className="my-1 mb-4 text-muted">{body}</p>
      {action}
    </div>
  );
}
