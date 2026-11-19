import type { ReactNode } from "react";
import { LanguageSwitcher } from "../molecules/LanguageSwitcher.tsx";

interface AuthTemplateProps {
  title: string;
  sentence: string;
  onLanguage: (language: "en" | "zh-TW") => void;
  children: ReactNode;
}

export function AuthTemplate({ title, sentence, onLanguage, children }: AuthTemplateProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center gap-6 px-6">
      <div className="self-end">
        <LanguageSwitcher onChange={onLanguage} />
      </div>
      <h1 className="text-[32px] leading-10 font-medium">{title}</h1>
      <p className="text-muted">{sentence}</p>
      {children}
    </main>
  );
}
