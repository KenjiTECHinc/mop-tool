import { useTranslation } from "react-i18next";
import type { Me, Ticket } from "../../types.ts";
import { Avatar } from "../atoms/Avatar.tsx";
import { PriorityBars } from "../atoms/PriorityBars.tsx";
import { StatusChip } from "../molecules/StatusChip.tsx";

interface TicketTableProps {
  tickets: Ticket[];
  people: Me["user"][];
  onOpen: (ticket: Ticket) => void;
  onSort: (key: string) => void;
}

export function TicketTable({ tickets, people, onOpen, onSort }: TicketTableProps) {
  const { t } = useTranslation();
  const name = (id?: string) => people.find((person) => person.userId === id)?.name ?? "";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-[13px] text-muted">
            {["id", "title", "status", "priority", "assignee"].map((column) => (
              <th key={column} className="border-b border-line-strong px-3 py-2 font-medium">
                <button type="button" onClick={() => onSort(column === "id" ? "ticketId" : column)}>
                  {t(`table.${column}`)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.ticketId} className="cursor-pointer hover:bg-paper" onClick={() => onOpen(ticket)}>
              <td className="h-12 border-b border-line px-3 tabular-nums text-muted">{ticket.ticketId}</td>
              <td className="border-b border-line px-3 font-medium">{ticket.title}</td>
              <td className="border-b border-line px-3">
                <StatusChip status={ticket.status} />
              </td>
              <td className="border-b border-line px-3">
                <PriorityBars level={ticket.priority} label={t(`priority.${ticket.priority}`)} />
              </td>
              <td className="border-b border-line px-3">{name(ticket.assigneeId) ? <Avatar name={name(ticket.assigneeId)} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
