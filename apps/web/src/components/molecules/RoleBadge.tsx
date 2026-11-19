import { Chip } from "../atoms/Chip.tsx";

interface RoleBadgeProps {
  jobTitle: string;
  tier: string;
}

export function RoleBadge({ jobTitle, tier }: RoleBadgeProps) {
  return <Chip tone="role">{`${jobTitle} · ${tier}`}</Chip>;
}
