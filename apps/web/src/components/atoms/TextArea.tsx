import type { TextareaHTMLAttributes } from "react";

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-24 w-full rounded-[8px] border border-line-strong bg-paper px-3 py-2 text-[15px] focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] ${className}`}
      {...props}
    />
  );
}
