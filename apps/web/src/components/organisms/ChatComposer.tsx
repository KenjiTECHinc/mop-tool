import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

interface ChatComposerProps {
  onSend: (message: string, notes?: string) => void;
  busy: boolean;
  notesMode?: boolean;
}

export function ChatComposer({ onSend, busy, notesMode = false }: ChatComposerProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (notesMode) setMessage(t("quick.notes"));
  }, [notesMode, t]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    onSend(message.trim(), notes.trim() || undefined);
    setMessage("");
    setNotes("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {notesMode ? (
        <label className="text-[13px] font-medium">
          {t("field.notes")}
          <textarea
            className="mt-1.5 min-h-28 w-full rounded-[8px] border border-line-strong bg-paper px-3 py-2 font-normal"
            value={notes}
            maxLength={10000}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      ) : null}
      <div className="flex items-center gap-3 rounded-[20px] border border-line-strong bg-paper py-2.5 pr-2.5 pl-5 text-muted">
        <label className="sr-only" htmlFor="composer">
          {t("composer.placeholder")}
        </label>
        <input
          id="composer"
          className="min-w-0 flex-1 bg-transparent text-ink outline-none"
          placeholder={t("composer.placeholder")}
          value={message}
          maxLength={4000}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button
          type="submit"
          className="grid h-9 w-9 place-items-center rounded-full bg-accent font-bold text-on-accent disabled:opacity-40"
          aria-label={t("composer.send")}
          disabled={busy || !message.trim()}
        >
          ↑
        </button>
      </div>
    </form>
  );
}
