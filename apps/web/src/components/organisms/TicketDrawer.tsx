import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Comment, Me, Ticket } from "../../types.ts";
import { Button } from "../atoms/Button.tsx";
import { Select } from "../atoms/Select.tsx";
import { TextArea } from "../atoms/TextArea.tsx";
import { StatusChip } from "../molecules/StatusChip.tsx";

interface TicketDrawerProps {
  ticket: Ticket;
  comments: Comment[];
  me: Me;
  people: { userId: string; name: string }[];
  onClose: () => void;
  onEdit: (ticket: Ticket) => void;
  onStatus: (status: string) => void;
  onComment: (body: string) => void;
  onDelete: () => void;
}

export function TicketDrawer({ ticket, comments, me, people, onClose, onEdit, onStatus, onComment, onDelete }: TicketDrawerProps) {
  const { t, i18n } = useTranslation();
  const [body, setBody] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEdit = me.tier === "T2" || (me.tier === "T1" && ticket.projectId === "sandbox");
  const canDiscuss = me.tier === "T2" || me.tier === "T3" || canEdit;
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="fixed inset-y-0 right-0 z-20 w-full max-w-[420px] overflow-auto border border-line bg-paper p-5 sm:rounded-l-[12px]" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="text-[13px] text-muted tabular-nums">{ticket.ticketId}</div>
      <h2 id="drawer-title" className="text-lg font-medium">{ticket.title}</h2>
      <div className="my-3 flex flex-wrap gap-2">
        <StatusChip status={ticket.status} />
        <span className="text-sm">{t(`type.${ticket.type}`)}</span>
      </div>
      <p className="whitespace-pre-wrap">{ticket.description}</p>
      {ticket.acceptanceCriteria ? <p className="mt-3 whitespace-pre-wrap text-muted">{ticket.acceptanceCriteria}</p> : null}
      {canDiscuss ? (
        <label className="mt-4 block text-[13px] font-medium">
          {t("tickets.status")}
          <Select
            className="mt-1.5 w-full"
            value={ticket.status}
            options={["todo", "in_progress", "blocked", "in_review", "done"].map((status) => ({ value: status, label: t(`status.${status}`) }))}
            onChange={(event) => onStatus(event.target.value)}
          />
        </label>
      ) : null}
      <h3 className="mt-6 text-base font-medium">{t("drawer.comments")}</h3>
      {comments.length === 0 ? <p className="text-muted">{t("drawer.emptyComments")}</p> : null}
      <ul className="mt-3 flex flex-col gap-3">
        {comments.map((comment) => (
          <li key={comment.commentId}>
            <div className="text-[13px] text-muted">
              {people.find((person) => person.userId === comment.authorId)?.name ?? comment.authorId} · {when.format(new Date(comment.createdAt))}
            </div>
            <p className="whitespace-pre-wrap">{comment.body}</p>
          </li>
        ))}
      </ul>
      {canDiscuss ? (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim()) return;
            onComment(body.trim());
            setBody("");
          }}
        >
          <TextArea aria-label={t("field.comment")} value={body} onChange={(event) => setBody(event.target.value)} />
          <Button className="mt-2" size="sm" type="submit">{t("field.comment")}</Button>
        </form>
      ) : null}
      <div className="mt-6 flex gap-2">
        {canEdit ? <Button size="sm" variant="secondary" onClick={() => onEdit(ticket)}>{t("action.edit")}</Button> : null}
        {canEdit && !confirmDelete ? <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>{t("action.delete")}</Button> : null}
        {canEdit && confirmDelete ? <Button size="sm" variant="danger" onClick={onDelete}>{t("action.deleteTicket")}</Button> : null}
        <Button size="sm" variant="ghost" onClick={onClose}>{t("action.close")}</Button>
      </div>
    </aside>
  );
}
