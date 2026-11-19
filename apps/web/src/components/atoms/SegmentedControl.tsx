interface SegmentedControlProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
}

export function SegmentedControl({ value, options, onChange, label }: SegmentedControlProps) {
  return (
    <div className="inline-flex rounded-[8px] border border-line-strong bg-paper p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${option.value === value ? "bg-ink text-stone" : "text-muted"}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
