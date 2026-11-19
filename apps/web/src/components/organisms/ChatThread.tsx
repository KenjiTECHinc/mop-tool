import { useTranslation } from "react-i18next";
import type { ChatBlock } from "../../types.ts";
import { Alert } from "../atoms/Alert.tsx";
import { StatusChip } from "../molecules/StatusChip.tsx";
import { ConfirmationCard } from "./ConfirmationCard.tsx";
import { ProposalCard } from "./ProposalCard.tsx";

interface ChatThreadProps {
  blocks: ChatBlock[];
  onOpenTicket: (ticketId: string) => void;
  onConfirm: (actionId: string, body?: unknown) => void;
  onReject: (actionId: string) => void;
}

export function ChatThread({ blocks, onOpenTicket, onConfirm, onReject }: ChatThreadProps) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
      {blocks.map((block) => {
        if (block.kind === "user") {
          return (
            <p key={block.id} className="max-w-[80%] self-end rounded-[20px_20px_4px_20px] bg-ink px-4 py-2.5 text-stone">
              {block.text}
            </p>
          );
        }
        if (block.kind === "assistant") {
          return (
            <div key={block.id} className="flex max-w-[92%] gap-3">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
              <div>
                {block.tool ? <p className="text-[13px] text-muted">{t(`tool.${block.tool}`, { defaultValue: block.tool })}</p> : null}
                {block.text ? <p className="whitespace-pre-wrap">{block.text}</p> : null}
              </div>
            </div>
          );
        }
        if (block.kind === "ticket") {
          return (
            <button
              key={block.id}
              type="button"
              className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-paper px-4 py-3 text-left"
              onClick={() => onOpenTicket(block.ticket.ticketId)}
            >
              <span>
                <span className="block text-[13px] text-muted tabular-nums">{block.ticket.ticketId}</span>
                <span className="font-medium">{block.ticket.title}</span>
              </span>
              <StatusChip status={block.ticket.status} />
            </button>
          );
        }
        if (block.kind === "confirmation") return <ConfirmationCard key={block.id} action={block.action} onConfirm={(id) => onConfirm(id)} onReject={onReject} />;
        if (block.kind === "proposal") return <ProposalCard key={block.id} action={block.action} onConfirm={onConfirm} onReject={onReject} />;
        if (block.kind === "notice") return <Alert key={block.id} title={t("notice.redacted")} />;
        return <Alert key={block.id} title={t(`error.${block.code}`, { defaultValue: t("error.generic") })} />;
      })}
    </div>
  );
}
