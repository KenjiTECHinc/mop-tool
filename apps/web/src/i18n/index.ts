import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json" with { type: "json" };
import zh from "./zh-TW.json" with { type: "json" };

const stored = window.localStorage.getItem("mops.lang");
const browser = navigator.language.toLowerCase().startsWith("zh") ? "zh-TW" : "en";
const initial = stored === "zh-TW" || stored === "en" ? stored : browser;

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, "zh-TW": { translation: zh } },
  lng: initial,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export async function setLanguage(language: "en" | "zh-TW"): Promise<void> {
  window.localStorage.setItem("mops.lang", language);
  document.documentElement.lang = language === "zh-TW" ? "zh-Hant" : "en";
  await i18n.changeLanguage(language);
}

document.documentElement.lang = initial === "zh-TW" ? "zh-Hant" : "en";

export default i18n;
