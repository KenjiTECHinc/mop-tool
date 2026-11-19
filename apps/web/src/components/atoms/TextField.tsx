import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function TextField({ invalid = false, className = "", ...props }: TextFieldProps) {
  return (
    <input
      className={`h-10 w-full rounded-[8px] border bg-paper px-3 text-[15px] ${invalid ? "border-[1.5px] border-ink" : "border-line-strong focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"} ${className}`}
      {...props}
    />
  );
}
