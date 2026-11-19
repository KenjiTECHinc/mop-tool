import type { ReactNode } from "react";
import { Header } from "../organisms/Header.tsx";

interface AppShellProps {
  name: string;
  jobTitle: string;
  tier: "T1" | "T2" | "T3";
  onLanguage: (language: "en" | "zh-TW") => void;
  children: ReactNode;
}

export function AppShell({ name, jobTitle, tier, onLanguage, children }: AppShellProps) {
  return (
    <>
      <Header name={name} jobTitle={jobTitle} tier={tier} onLanguage={onLanguage} />
      {children}
    </>
  );
}
