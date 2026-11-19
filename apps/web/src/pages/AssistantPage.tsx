import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client.ts";
import { useChat } from "../chat/useChat.ts";
import { Button } from "../components/atoms/Button.tsx";
import { ChatComposer } from "../components/organisms/ChatComposer.tsx";
import { ChatThread } from "../components/organisms/ChatThread.tsx";
import { TicketDrawer } from "../components/organisms/TicketDrawer.tsx";
import { useSession } from "../context/SessionContext.tsx";
import type { Comment, Me, Ticket } from "../types.ts";

export function AssistantPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const chat = useChat("/ai/chat");
  const [ticketId, setTicketId] = useState("");
  const [notesMode, setNotesMode] = useState(false);
  if (!me) return null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "greeting.morning" : hour < 18 ? "greeting.afternoon" : "greeting.evening";
  const quick = quickActions(me);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-[680px] flex-col justify-between gap-8 px-6 py-14">
      <div>
        {chat.blocks.length === 0 ? (
          <>
            <h1 className="text-[32px] leading-10 font-medium">{t(greeting, { name: me.user.name.split(" ")[0] })}</h1>
            <p className="mt-2 text-muted">{t("greeting.prompt")}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {quick.map((item) => (
                <Button
                  key={item.key}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (item.notes) {
                      setNotesMode(true);
                      return;
                    }
                    void chat.send(t(item.key));
                  }}
                >
                  {t(item.key)}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <ChatThread blocks={chat.blocks} onOpenTicket={setTicketId} onConfirm={(id, body) => void chat.confirm(id, body)} onReject={(id) => void chat.reject(id)} />
        )}
      </div>
      <ChatComposer busy={chat.busy} notesMode={notesMode} onSend={(message, notes) => void chat.send(message, notes)} />
      {chat.toast ? <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-[8px] bg-ink px-4 py-3 text-sm text-stone">{chat.toast}</div> : null}
      {ticketId ? <TicketPeek ticketId={ticketId} me={me} onClose={() => setTicketId("")} notify={chat.notify} /> : null}
    </div>
  );
}

function TicketPeek({ ticketId, me, onClose, notify }: { ticketId: string; me: Me; onClose: () => void; notify: (key: string) => void }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  useEffect(() => {
    let active = true;
    api.ticket(ticketId).then((result) => {
      if (!active) return;
      setTicket(result.ticket);
      setComments(result.comments);
    }).catch(() => {
      if (active) onClose();
    });
    return () => {
      active = false;
    };
  }, [ticketId, onClose]);
  if (!ticket) return null;
  return (
    <TicketDrawer
      ticket={ticket}
      comments={comments}
      me={me}
      people={[]}
      onClose={onClose}
      onEdit={() => undefined}
      onStatus={(status) => void api.status(ticket.ticketId, status, ticket.version).then(() => notify("toast.updated"))}
      onComment={(body) => void api.comment(ticket.ticketId, body).then(() => notify("toast.commented"))}
      onDelete={() => void api.deleteTicket(ticket.ticketId, ticket.version).then(() => { notify("toast.deleted"); onClose(); })}
    />
  );
}

function quickActions(me: Me): { key: string; notes: boolean }[] {
  if (me.tier === "T1") return [{ key: "quick.briefing", notes: false }, { key: "quick.activity", notes: false }];
  if (me.tier === "T2") return [{ key: "quick.briefing", notes: false }, { key: "quick.blocked", notes: false }, { key: "quick.notes", notes: true }];
  return [{ key: "quick.briefing", notes: false }, { key: "quick.blocked", notes: false }, { key: "quick.comment", notes: false }];
}
