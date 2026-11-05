import { useCallback } from "react";
import { create } from "zustand";
import { nl } from "./nl";
import { en } from "./en";

export type Lang = "nl" | "en";
export type MessageKey = keyof typeof nl;
export type Dictionary = Record<MessageKey, string>;

export const dictionaries: Record<Lang, Dictionary> = { nl, en };

const STORAGE_KEY = "pc-checker.lang";

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "nl" || stored === "en") return stored;
  } catch {
    /* localStorage niet beschikbaar */
  }
  if (typeof navigator !== "undefined" && !navigator.language.toLowerCase().startsWith("nl")) {
    return "en";
  }
  return "nl";
}

/** Vult `{naam}`-placeholders in. Onbekende placeholders blijven zichtbaar staan. */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const msg = dictionaries[lang][key] ?? dictionaries.nl[key] ?? key;
  return interpolate(msg, vars);
}

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* niet fataal */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

/** React-hook: `const t = useT(); t("nav.overview")`. */
export function useT() {
  const lang = useI18nStore((s) => s.lang);
  // Stabiel per taal, zodat `t` veilig in useMemo/useEffect-afhankelijkheden kan staan.
  return useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
}

/** Locale voor `Intl`/`toLocaleString`, afgeleid van de gekozen taal. */
export function intlLocale(lang: Lang = useI18nStore.getState().lang): string {
  return lang === "en" ? "en-GB" : "nl-NL";
}

/** Voor gebruik buiten React (stores, utilities). */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(useI18nStore.getState().lang, key, vars);
}
