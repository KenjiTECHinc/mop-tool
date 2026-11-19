import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Ticket } from "../../types.ts";
import { Button } from "../atoms/Button.tsx";
import { Select } from "../atoms/Select.tsx";
import { TextArea } from "../atoms/TextArea.tsx";
import { TextField } from "../atoms/TextField.tsx";

export interface TicketDraft {
  title: string;
  description: string;
  type: Ticket["type"];
  priority: Ticket["priority"];
  assigneeId?: string;
  acceptanceCriteria: string;
}

interface TicketFormProps {
  ticket?: Ticket;
  people: { userId: string; name: string }[];
  onClose: () => void;
  onSubmit: (draft: TicketDraft) => void;
}

export function TicketForm({ ticket, people, onClose, onSubmit }: TicketFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(ticket?.title ?? "");
  const [description, setDescription] = useState(ticket?.description ?? "");
  const [type, setType] = useState<Ticket["type"]>(ticket?.type ?? "task");
  const [priority, setPriority] = useState<Ticket["priority"]>(ticket?.priority ?? "medium");
  const [assigneeId, setAssigneeId] = useState(ticket?.assigneeId ?? "");
  const [acceptanceCriteria, setAcceptance] = useState(ticket?.acceptanceCriteria ?? "");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ title, description, type, priority, assigneeId: assigneeId || undefined, acceptanceCriteria });
  }

  return (
    <form className="fixed inset-0 z-30 grid place-items-center bg-[color-mix(in_srgb,var(--ink)_32%,transparent)] p-6" onSubmit={submit} role="dialog" aria-modal="true">
      <div className="w-full max-w-[420px] rounded-[12px] bg-paper p-6 shadow-[0_8px_24px_rgba(23,25,27,.12)]">
        <h2 className="text-lg font-medium">{ticket ? t("action.save") : t("action.create")}</h2>
        <label className="mt-4 block text-[13px] font-medium">{t("field.title")}<TextField className="mt-1.5" required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="mt-3 block text-[13px] font-medium">{t("field.description")}<TextArea className="mt-1.5" required value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-[13px] font-medium">{t("field.type")}<Select className="mt-1.5 w-full" value={type} onChange={(event) => setType(event.target.value as Ticket["type"])} options={["bug", "story", "task"].map((value) => ({ value, label: t(`type.${value}`) }))} /></label>
          <label className="text-[13px] font-medium">{t("field.priority")}<Select className="mt-1.5 w-full" value={priority} onChange={(event) => setPriority(event.target.value as Ticket["priority"])} options={["low", "medium", "high", "critical"].map((value) => ({ value, label: t(`priority.${value}`) }))} /></label>
        </div>
        <label className="mt-3 block text-[13px] font-medium">{t("field.assignee")}<Select className="mt-1.5 w-full" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} options={[{ value: "", label: t("tickets.all") }, ...people.map((person) => ({ value: person.userId, label: person.name }))]} /></label>
        <label className="mt-3 block text-[13px] font-medium">{t("field.acceptance")}<TextArea className="mt-1.5" value={acceptanceCriteria} onChange={(event) => setAcceptance(event.target.value)} /></label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t("action.cancel")}</Button>
          <Button type="submit">{ticket ? t("action.save") : t("action.create")}</Button>
        </div>
      </div>
    </form>
  );
}
