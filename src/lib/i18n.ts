import i18n from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";
import en from "../../locales/en.json";
import ru from "../../locales/ru.json";
import de from "../../locales/de.json";
import es from "../../locales/es.json";
import zh from "../../locales/zh.json";

// Languages of the interface (FTR.NAB.CMN-0001 R31–R32): English by default.
export const LANGUAGES = ["en", "ru", "de", "es", "zh"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Language names are shown in their own language. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English", ru: "Русский", de: "Deutsch", es: "Español", zh: "中文",
};

/** Short labels of the language switch in one line (R31, UI-07). */
export const LANGUAGE_SHORT: Record<Language, string> = { en: "EN", ru: "RU", de: "DE", es: "ES", zh: "ZH" };

export const resources = {
  en: { translation: en }, ru: { translation: ru }, de: { translation: de }, es: { translation: es }, zh: { translation: zh },
};

/** Before sign-in: the browser language if supported, otherwise the default. */
export function detectLanguage(browser: readonly string[], fallback = "en"): Language {
  for (const b of browser) {
    const base = b.split("-")[0].toLowerCase();
    const hit = LANGUAGES.find((l) => l === base);
    if (hit) return hit;
  }
  return (LANGUAGES as readonly string[]).includes(fallback) ? (fallback as Language) : "en";
}

/** The locale of Intl formatting for a language code. */
export const intlLocale = (lng: string) => (lng === "zh" ? "zh-CN" : lng);

export function createI18n(lng: string) {
  const inst = i18n.createInstance();
  inst.use(ICU).use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: "en",
    supportedLngs: [...LANGUAGES],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return inst;
}

export function setDocumentLanguage(lng: string) {
  document.documentElement.lang = intlLocale(lng);
}

export const i18nInstance = createI18n(detectLanguage(typeof navigator !== "undefined" ? navigator.languages : []));
