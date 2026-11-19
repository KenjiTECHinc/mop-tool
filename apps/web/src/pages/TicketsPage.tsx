import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client.ts";
import { useChat } from "../chat/useChat.ts";
import { Button } from "../components/atoms/Button.tsx";
import { Select } from "../components/atoms/Select.tsx";
import { TextField } from "../components/atoms/TextField.tsx";
import { ChatDock } from "../components/organisms/ChatDock.tsx";
import { EmptyState } from "../components/molecules/EmptyState.tsx";
import { TicketDrawer } from "../components/organisms/TicketDrawer.tsx";
import { TicketForm } from "../components/organisms/TicketForm.tsx";
import { TicketTable } from "../components/organisms/TicketTable.tsx";
import { useSession } from "../context/SessionContext.tsx";
import type { Comment, Me, Ticket } from "../types.ts";

export function TicketsPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const chat = useChat("/ai/chat");
  const [projectId, setProjectId] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [people, setPeople] = useState<Me["user"][]>([]);
  const [status, setStatus] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState("");
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!me || projectId) return;
    setProjectId(me.projects[0]?.projectId ?? "");
  }, [me, projectId]);

  useEffect(() => {
    if (!projectId) return;
    const query = { status, assigneeId, priority, type, q };
    Promise.all([api.tickets(projectId, query), api.members(projectId)])
      .then(([ticketResult, memberResult]) => {
        setTickets(ticketResult.tickets);
        setPeople(memberResult.members as Me["user"][]);
      })
      .catch(() => {
        setTickets([]);
        setPeople([]);
      });
  }, [projectId, status, assigneeId, priority, type, q, toast]);

  useEffect(() => {
    if (!openId) {
      setOpenTicket(null);
      return;
    }
    api.ticket(openId).then((result) => {
      setOpenTicket(result.ticket);
      setComments(result.comments);
    }).catch(() => setOpenId(""));
  }, [openId, toast]);

  if (!me) return null;
  const project = me.projects.find((item) => item.projectId === projectId);
  const canCreate = me.tier === "T2" || (me.tier === "T1" && project?.isSandbox);
  const options = (values: string[], group: string) => [{ value: "", label: t("tickets.all") }, ...values.map((value) => ({ value, label: t(`${group}.${value}`) }))];

  function notify(key: string) {
    setToast(t(key));
    window.setTimeout(() => setToast(""), 4000);
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1>{project?.name ?? t("nav.tickets")}</h1>
        {canCreate && project ? <Button size="sm" onClick={() => setCreating(true)}>{t("tickets.new")}</Button> : null}
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <Select aria-label={t("tickets.project")} value={projectId} onChange={(event) => setProjectId(event.target.value)} options={me.projects.map((item) => ({ value: item.projectId, label: item.name }))} />
        <Select aria-label={t("tickets.status")} value={status} onChange={(event) => setStatus(event.target.value)} options={options(["todo", "in_progress", "blocked", "in_review", "done"], "status")} />
        <Select aria-label={t("tickets.assignee")} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} options={[{ value: "", label: t("tickets.all") }, ...people.map((person) => ({ value: person.userId, label: person.name }))]} />
        <Select aria-label={t("tickets.priority")} value={priority} onChange={(event) => setPriority(event.target.value)} options={options(["low", "medium", "high", "critical"], "priority")} />
        <Select aria-label={t("tickets.type")} value={type} onChange={(event) => setType(event.target.value)} options={options(["bug", "story", "task"], "type")} />
        <TextField aria-label={t("tickets.search")} placeholder={t("tickets.search")} value={q} onChange={(event) => setQ(event.target.value)} className="max-w-60" />
      </div>
      {tickets.length === 0 ? <EmptyState title={t("tickets.emptyTitle")} body={t("tickets.emptyBody")} /> : <TicketTable tickets={tickets} people={people} onOpen={(ticket) => setOpenId(ticket.ticketId)} onSort={() => undefined} />}
      <ChatDock blocks={chat.blocks} busy={chat.busy} onSend={(message, notes) => void chat.send(message, notes)} onOpenTicket={setOpenId} onConfirm={(id, body) => void chat.confirm(id, body)} onReject={(id) => void chat.reject(id)} />
      {openTicket ? (
        <TicketDrawer
          ticket={openTicket}
          comments={comments}
          me={me}
          people={people}
          onClose={() => setOpenId("")}
          onEdit={(ticket) => { setOpenId(""); setEditing(ticket); }}
          onStatus={(statusValue) => void api.status(openTicket.ticketId, statusValue, openTicket.version).then(() => notify("toast.updated"))}
          onComment={(body) => void api.comment(openTicket.ticketId, body).then(() => notify("toast.commented"))}
          onDelete={() => void api.deleteTicket(openTicket.ticketId, openTicket.version).then(() => { notify("toast.deleted"); setOpenId(""); })}
        />
      ) : null}
      {(creating || editing) && project ? (
        <TicketForm
          ticket={editing ?? undefined}
          people={people}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSubmit={(draft) => {
            const save = editing
              ? api.updateTicket(editing.ticketId, { ...draft, version: editing.version })
              : api.createTicket({ ...draft, projectId: project.projectId });
            void save.then(() => {
              notify(editing ? "toast.updated" : "toast.created");
              setCreating(false);
              setEditing(null);
            }).catch((reason: unknown) => notify(reason instanceof Error ? `error.${reason.message}` : "error.generic"));
          }}
        />
      ) : null}
      {toast ? <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-[8px] bg-ink px-4 py-3 text-sm text-stone">{toast}</div> : null}
    </div>
  );
}
