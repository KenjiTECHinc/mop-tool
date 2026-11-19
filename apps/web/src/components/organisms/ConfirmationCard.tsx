import { useTranslation } from "react-i18next";
import type { PendingView } from "../../types.ts";
import { Button } from "../atoms/Button.tsx";

interface ConfirmationCardProps {
  action: PendingView;
  onConfirm: (actionId: string) => void;
  onReject: (actionId: string) => void;
}

export function ConfirmationCard({ action, onConfirm, onReject }: ConfirmationCardProps) {
  const { t } = useTranslation();
  const payload = action.payload;
  const titleKey =
    action.toolName === "propose_delete_ticket"
      ? "confirm.deleteTitle"
      : action.toolName === "propose_comment"
        ? "confirm.commentTitle"
        : action.toolName === "propose_status_change"
          ? "confirm.statusTitle"
          : action.toolName === "propose_edit_ticket"
            ? "confirm.editTitle"
            : "confirm.createTitle";
  const rows = Object.entries(payload).filter(([key, value]) => key !== "version" && typeof value === "string" && value);

  return (
    <div className="rounded-[12px] border-[1.5px] border-accent bg-paper p-4">
      <b>{t(titleKey, { id: String(payload.ticketId ?? "") })}</b>
      <dl className="mt-2 grid grid-cols-[96px_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted">{key}</dt>
            <dd className="m-0">{String(value)}</dd>
          </div>
        ))}
      </dl>
      <footer className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => onReject(action.actionId)}>
          {t("action.cancel")}
        </Button>
        <Button size="sm" variant={action.toolName === "propose_delete_ticket" ? "danger" : "primary"} onClick={() => onConfirm(action.actionId)}>
          {action.toolName === "propose_delete_ticket" ? t("action.deleteTicket") : t("action.confirm")}
        </Button>
      </footer>
    </div>
  );
}
