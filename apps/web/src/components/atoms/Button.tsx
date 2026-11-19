import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
}

const variants = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-ink bg-transparent hover:bg-line",
  ghost: "bg-transparent hover:bg-line",
  danger: "bg-ink text-stone",
};

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...props }: ButtonProps) {
  const height = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm";
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-[8px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${height} ${className}`}
      {...props}
    />
  );
}
