interface AvatarProps {
  name: string;
}

export function Avatar({ name }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-stone" aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
