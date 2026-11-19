import { useTranslation } from "react-i18next";
import type { Me, Project } from "../../types.ts";
import { Button } from "../atoms/Button.tsx";
import { Select } from "../atoms/Select.tsx";

interface MembershipFormProps {
  projects: Project[];
  users: Me["user"][];
  projectId: string;
  userId: string;
  onProject: (id: string) => void;
  onUser: (id: string) => void;
  onAdd: () => void;
  onRemove: () => void;
}

export function MembershipForm({ projects, users, projectId, userId, onProject, onUser, onAdd, onRemove }: MembershipFormProps) {
  const { t } = useTranslation();
  return (
    <form
      className="mt-6 flex flex-wrap gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd();
      }}
    >
      <Select aria-label={t("tickets.project")} value={projectId} onChange={(event) => onProject(event.target.value)} options={projects.map((project) => ({ value: project.projectId, label: project.name }))} />
      <Select aria-label={t("admin.users")} value={userId} onChange={(event) => onUser(event.target.value)} options={users.map((user) => ({ value: user.userId, label: user.name }))} />
      <Button type="submit">{t("admin.add")}</Button>
      <Button variant="secondary" onClick={onRemove}>{t("admin.remove")}</Button>
    </form>
  );
}
