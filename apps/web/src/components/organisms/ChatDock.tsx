import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatBlock } from "../../types.ts";
import { Button } from "../atoms/Button.tsx";
import { ChatComposer } from "./ChatComposer.tsx";
import { ChatThread } from "./ChatThread.tsx";

interface ChatDockProps {
  blocks: ChatBlock[];
  busy: boolean;
  onSend: (message: string, notes?: string) => void;
  onOpenTicket: (ticketId: string) => void;
  onConfirm: (actionId: string, body?: unknown) => void;
  onReject: (actionId: string) => void;
}

export function ChatDock({ blocks, busy, onSend, onOpenTicket, onConfirm, onReject }: ChatDockProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2">
        <Button onClick={() => setOpen(true)}>{t("nav.ask")}</Button>
      </div>
      {open ? (
        <aside className="fixed inset-y-0 right-0 z-20 flex w-full max-w-[420px] flex-col border border-line bg-stone p-4">
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t("action.close")}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <ChatThread blocks={blocks} onOpenTicket={onOpenTicket} onConfirm={onConfirm} onReject={onReject} />
          </div>
          <ChatComposer busy={busy} onSend={onSend} />
        </aside>
      ) : null}
    </>
  );
}
