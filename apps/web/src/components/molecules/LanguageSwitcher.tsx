import { useTranslation } from "react-i18next";
import { SegmentedControl } from "../atoms/SegmentedControl.tsx";

interface LanguageSwitcherProps {
  onChange: (language: "en" | "zh-TW") => void;
}

export function LanguageSwitcher({ onChange }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  return (
    <SegmentedControl
      label={t("nav.assistant")}
      value={i18n.language === "zh-TW" ? "zh-TW" : "en"}
      options={[
        { value: "en", label: "EN" },
        { value: "zh-TW", label: "中文" },
      ]}
      onChange={(value) => onChange(value === "zh-TW" ? "zh-TW" : "en")}
    />
  );
}
