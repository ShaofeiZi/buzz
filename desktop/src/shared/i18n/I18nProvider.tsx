import * as React from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

import {
  formatMessage,
  isLanguagePreference,
  LANGUAGE_STORAGE_KEY,
  resolveLocale,
  type LanguagePreference,
  type SupportedLocale,
  type TranslationParams,
} from "./i18n";
import { setCurrentLiteralLocale } from "./literalTranslation";
import type { MessageKey } from "./messages/en";

type I18nContextValue = {
  locale: SupportedLocale;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  t: (key: MessageKey, params?: TranslationParams) => string;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];
}

function storedPreference(): LanguagePreference {
  if (typeof window === "undefined") return "system";
  const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguagePreference(value) ? value : "system";
}

/** Provide the active locale, persisted preference, and typed translator. */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] =
    React.useState<LanguagePreference>(storedPreference);
  const [systemLanguages, setSystemLanguages] =
    React.useState<readonly string[]>(browserLanguages);
  const locale = resolveLocale(preference, systemLanguages);
  setCurrentLiteralLocale(locale);

  React.useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = "ltr";
    if (isTauri()) {
      void invoke("set_app_locale", { locale }).catch(() => {
        // Native menu localization is best effort; the WebView stays localized.
      });
    }
  }, [locale]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleLanguageChange = () => setSystemLanguages(browserLanguages());
    window.addEventListener("languagechange", handleLanguageChange);
    return () =>
      window.removeEventListener("languagechange", handleLanguageChange);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === LANGUAGE_STORAGE_KEY &&
        isLanguagePreference(event.newValue)
      ) {
        setPreferenceState(event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setPreference = React.useCallback(
    (nextPreference: LanguagePreference) => {
      setPreferenceState(nextPreference);
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextPreference);
    },
    [],
  );

  const t = React.useCallback(
    (key: MessageKey, params?: TranslationParams) =>
      formatMessage(locale, key, params),
    [locale],
  );

  const value = React.useMemo<I18nContextValue>(
    () => ({ locale, preference, setPreference, t }),
    [locale, preference, setPreference, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Read the desktop i18n context from a descendant component. */
export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
