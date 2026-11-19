import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Avatar } from "../atoms/Avatar.tsx";
import { LanguageSwitcher } from "../molecules/LanguageSwitcher.tsx";
import { RoleBadge } from "../molecules/RoleBadge.tsx";

interface HeaderProps {
  name: string;
  jobTitle: string;
  tier: "T1" | "T2" | "T3";
  onLanguage: (language: "en" | "zh-TW") => void;
}

export function Header({ name, jobTitle, tier, onLanguage }: HeaderProps) {
  const { t } = useTranslation();
  const link = "text-sm text-muted aria-[current=page]:font-medium aria-[current=page]:text-ink";
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-5 border-b border-line px-5">
      <span className="font-bold">{t("app.name")}</span>
      <nav className="flex gap-4">
        <NavLink className={link} to="/" end>
          {t("nav.assistant")}
        </NavLink>
        <NavLink className={link} to="/tickets">
          {t("nav.tickets")}
        </NavLink>
        {tier === "T1" ? (
          <NavLink className={link} to="/admin">
            {t("nav.admin")}
          </NavLink>
        ) : null}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <LanguageSwitcher onChange={onLanguage} />
        <RoleBadge jobTitle={jobTitle} tier={tier} />
        <Avatar name={name} />
      </div>
    </header>
  );
}
