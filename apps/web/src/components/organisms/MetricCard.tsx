interface MetricCardProps {
  label: string;
  value: string;
}

export function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-[12px] border border-line bg-paper p-4">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="text-lg font-medium tabular-nums">{value}</div>
    </div>
  );
}
