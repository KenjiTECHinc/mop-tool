import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PendingView } from "../../types.ts";
import { Button } from "../atoms/Button.tsx";
import { TextField } from "../atoms/TextField.tsx";

interface ProposalTicket {
  include?: boolean;
  projectId: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  assigneeId?: string;
  acceptanceCriteria?: string;
}

interface ProposalCardProps {
  action: PendingView;
  onConfirm: (actionId: string, tickets: ProposalTicket[]) => void;
  onReject: (actionId: string) => void;
}

export function ProposalCard({ action, onConfirm, onReject }: ProposalCardProps) {
  const { t } = useTranslation();
  const initial = (action.payload.tickets as ProposalTicket[] | undefined) ?? [];
  const [tickets, setTickets] = useState(initial.map((ticket) => ({ ...ticket, include: ticket.include !== false })));
  const selected = tickets.filter((ticket) => ticket.include).length;

  function update(index: number, patch: Partial<ProposalTicket>) {
    setTickets((current) => current.map((ticket, item) => (item === index ? { ...ticket, ...patch } : ticket)));
  }

  return (
    <div className="rounded-[12px] border-[1.5px] border-accent bg-paper p-4">
      <b>{t("proposal.title")}</b>
      <div className="mt-3 flex flex-col gap-3">
        {tickets.map((ticket, index) => (
          <label key={`${ticket.title}-${index}`} className="grid gap-2 rounded-[8px] border border-line p-3">
            <span className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ticket.include !== false} onChange={(event) => update(index, { include: event.target.checked })} />
              {t("action.include")}
            </span>
            <TextField aria-label={t("field.title")} value={ticket.title} onChange={(event) => update(index, { title: event.target.value })} />
          </label>
        ))}
      </div>
      <footer className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => onReject(action.actionId)}>
          {t("action.cancel")}
        </Button>
        <Button size="sm" disabled={selected === 0} onClick={() => onConfirm(action.actionId, tickets)}>
          {t("proposal.create", { count: selected })}
        </Button>
      </footer>
    </div>
  );
}
