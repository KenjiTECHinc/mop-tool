interface ChipProps {
  children: string;
  tone?: "plain" | "progress" | "blocked" | "review" | "done" | "role";
}

const tones = {
  plain: "border-line-strong",
  progress: "border-accent bg-accent-soft text-accent-hover",
  blocked: "border-ink bg-ink text-stone",
  review: "border-accent",
  done: "border-line text-muted",
  role: "border-line-strong bg-stone",
};

export function Chip({ children, tone = "plain" }: ChipProps) {
  return <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}
