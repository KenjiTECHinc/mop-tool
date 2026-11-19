interface PriorityBarsProps {
  level: "low" | "medium" | "high" | "critical";
  label: string;
}

const filled = { low: 1, medium: 2, high: 3, critical: 4 };

export function PriorityBars({ level, label }: PriorityBarsProps) {
  const count = filled[level];
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="inline-flex h-3 items-end gap-0.5" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={`block w-[3px] ${index < count ? "bg-ink" : "bg-line-strong"}`} style={{ height: 6 + index * 2 }} />
        ))}
      </span>
      {label}
    </span>
  );
}
