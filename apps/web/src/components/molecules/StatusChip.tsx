import { useTranslation } from "react-i18next";
import { Chip } from "../atoms/Chip.tsx";

const tone = {
  todo: "plain",
  in_progress: "progress",
  blocked: "blocked",
  in_review: "review",
  done: "done",
} as const;

export function StatusChip({ status }: { status: keyof typeof tone | string }) {
  const { t } = useTranslation();
  const key = status in tone ? (status as keyof typeof tone) : "todo";
  const label = key === "done" ? `✓ ${t(`status.${key}`)}` : t(`status.${key}`);
  return <Chip tone={tone[key]}>{label}</Chip>;
}
