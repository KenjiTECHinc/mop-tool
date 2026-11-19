import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, streamChat } from "../api/client.ts";
import type { ChatBlock } from "../types.ts";

export function useChat(path: string) {
  const { t } = useTranslation();
  const [blocks, setBlocks] = useState<ChatBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const conversationId = "desk";

  function push(block: ChatBlock) {
    setBlocks((current) => {
      const existing = current.find((item) => item.id === block.id && item.kind === "assistant" && block.kind === "assistant");
      if (existing && existing.kind === "assistant" && block.kind === "assistant") {
        return current.map((item) => (item.id === block.id && item.kind === "assistant" ? { ...item, text: item.text + block.text } : item));
      }
      return [...current, block];
    });
  }

  async function send(message: string, notes?: string) {
    setBlocks((current) => [...current, { id: crypto.randomUUID(), kind: "user", text: notes ? `${message}\n${notes}` : message }]);
    setBusy(true);
    try {
      await streamChat(path, { message, notes, conversationId }, push);
    } catch (error) {
      const code = error instanceof Error ? error.message : "INTERNAL";
      setBlocks((current) => [...current, { id: crypto.randomUUID(), kind: "error", code }]);
    } finally {
      setBusy(false);
    }
  }

  function notify(key: string) {
    setToast(t(key));
    window.setTimeout(() => setToast(""), 4000);
  }

  function fail(code: string) {
    setToast(t(`error.${code}`, { defaultValue: t("error.generic") }));
  }

  async function confirm(actionId: string, body?: unknown) {
    try {
      await api.confirm(actionId, body);
      notify("toast.confirmed");
    } catch (error) {
      fail(error instanceof Error ? error.message : "INTERNAL");
    }
  }

  async function reject(actionId: string) {
    try {
      await api.reject(actionId);
      notify("toast.rejected");
    } catch (error) {
      fail(error instanceof Error ? error.message : "INTERNAL");
    }
  }

  return { blocks, busy, toast, send, notify, fail, confirm, reject };
}
