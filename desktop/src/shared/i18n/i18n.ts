import { enMessages, type MessageKey } from "./messages/en";
import { zhCNMessages } from "./messages/zh-CN";

export const LANGUAGE_STORAGE_KEY = "buzz-language";

/** Locales currently shipped with the Buzz desktop client. */
export type SupportedLocale = "en" | "zh-CN";
/** Persisted language choice; `system` resolves from browser language priority. */
export type LanguagePreference = "system" | SupportedLocale;
/** Named values interpolated into `{{placeholder}}` message tokens. */
export type TranslationParams = Record<string, string | number>;

/** Ordered list of locales available in the language selector. */
export const supportedLocales: readonly SupportedLocale[] = ["en", "zh-CN"];
/** Ordered list of persisted language preferences available to users. */
export const languagePreferences: readonly LanguagePreference[] = [
  "system",
  ...supportedLocales,
];

const messagesByLocale: Record<SupportedLocale, Record<MessageKey, string>> = {
  en: enMessages,
  "zh-CN": zhCNMessages,
};

/** Return whether a stored value is a supported language preference. */
export function isLanguagePreference(
  value: unknown,
): value is LanguagePreference {
  return (
    typeof value === "string" &&
    (languagePreferences as readonly string[]).includes(value)
  );
}

/** Resolve the first supported locale in browser language-priority order. */
export function resolveSystemLocale(
  languages: readonly string[] | undefined,
): SupportedLocale {
  for (const language of languages ?? []) {
    const normalized = language.trim().toLowerCase();
    if (normalized === "zh" || normalized.startsWith("zh-")) {
      return "zh-CN";
    }
    if (normalized === "en" || normalized.startsWith("en-")) {
      return "en";
    }
  }
  return "en";
}

/** Resolve an explicit or system-following preference to a shipped locale. */
export function resolveLocale(
  preference: LanguagePreference,
  languages: readonly string[] | undefined,
): SupportedLocale {
  return preference === "system" ? resolveSystemLocale(languages) : preference;
}

/** Format one translated message with optional named interpolation values. */
export function formatMessage(
  locale: SupportedLocale,
  key: MessageKey,
  params?: TranslationParams,
): string {
  const template = messagesByLocale[locale][key] ?? enMessages[key];
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
