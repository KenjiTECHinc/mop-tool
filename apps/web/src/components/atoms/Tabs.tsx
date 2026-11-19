interface TabsProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export function Tabs({ value, options, onChange }: TabsProps) {
  return (
    <div className="flex gap-6 border-b border-line" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={`py-2.5 font-medium ${option.value === value ? "text-ink shadow-[inset_0_-2px_0_var(--ink)]" : "text-muted"}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
