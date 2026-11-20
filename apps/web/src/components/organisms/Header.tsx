import { useEffect, useId, useRef, useState } from "react";
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
  onSignOut: () => void;
}

export function Header({ name, jobTitle, tier, onLanguage, onSignOut }: HeaderProps) {
  const { t } = useTranslation();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const link = "text-sm text-muted aria-[current=page]:font-medium aria-[current=page]:text-ink";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
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
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="rounded-full outline-offset-2 hover:opacity-80"
            aria-label={t("nav.account")}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((current) => !current)}
          >
            <Avatar name={name} />
          </button>
          {open ? (
            <div id={menuId} role="menu" className="absolute right-0 top-9 z-10 min-w-36 border border-line bg-paper py-1 shadow-sm">
              <button
                type="button"
                role="menuitem"
                className="w-full px-3 py-2 text-left text-sm hover:bg-line"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
              >
                {t("nav.signOut")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
