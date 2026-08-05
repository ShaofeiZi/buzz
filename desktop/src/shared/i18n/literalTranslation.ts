import type { SupportedLocale } from "./i18n";
import { zhCNLiteralMessages } from "./messages/zh-CN-literals";
import { zhCNLiteralOverrides } from "./messages/zh-CN-literal-overrides";

type TemplateTranslation = {
  pattern: RegExp;
  translatedTemplate: string;
};

const TEMPLATE_TOKEN = "{{value}}";

const mergedMessages = {
  ...zhCNLiteralMessages,
  ...zhCNLiteralOverrides,
};

const exactMessages = new Map<string, string>(
  Object.entries(mergedMessages).filter(
    ([source]) => !source.includes(TEMPLATE_TOKEN),
  ),
);
const caseInsensitiveExactMessages = new Map(
  [...exactMessages].map(([source, translated]) => [
    source.toLocaleLowerCase(),
    translated,
  ]),
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function templatePattern(source: string): RegExp {
  const parts = source.split(TEMPLATE_TOKEN).map(escapeRegExp);
  return new RegExp(`^${parts.join("(.*?)")}$`, "u");
}

const templateMessages: readonly TemplateTranslation[] = Object.entries(
  mergedMessages,
)
  .filter(([source]) => {
    if (!source.includes(TEMPLATE_TOKEN)) return false;
    const staticCopy = source.replaceAll(TEMPLATE_TOKEN, "");
    return /[A-Za-z\u3400-\u9fff]{2,}/.test(staticCopy);
  })
  .map(([source, translatedTemplate]) => ({
    pattern: templatePattern(source),
    translatedTemplate,
  }))
  .sort(
    (left, right) =>
      right.pattern.source.replaceAll("(.+?)", "").length -
      left.pattern.source.replaceAll("(.+?)", "").length,
  );

function fillTemplate(template: string, values: readonly string[]): string {
  let index = 0;
  return normalizeChineseTypography(
    template
      .replaceAll(TEMPLATE_TOKEN, () => {
        const value = values[index++] ?? "";
        if (value === "s") return "";
        return (
          exactMessages.get(value) ??
          caseInsensitiveExactMessages.get(value.toLocaleLowerCase()) ??
          value
        );
      })
      .replace(/([\u3400-\u9fff])s\b/g, "$1"),
  );
}

function normalizeChineseTypography(value: string): string {
  return value
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/gu, "$1$2")
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/gu, "$1$2")
    .replace(/\s+([，。！？；：])/gu, "$1")
    .replace(/([，。！？；：])\s+/gu, "$1");
}

const ENGLISH_MONTH_RE =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i;
const ENGLISH_WEEKDAY_RE =
  /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;
const CLOCK_RE = /^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i;

function translateEnglishDateTime(source: string): string | null {
  const trimmed = source.trim();
  if (CLOCK_RE.test(trimmed)) {
    const match = /^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i.exec(trimmed);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const period = match[3]?.toUpperCase();
    if (period === "PM" && hour < 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    const date = new Date(2000, 0, 1, hour, minute);
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  if (!ENGLISH_MONTH_RE.test(trimmed) && !ENGLISH_WEEKDAY_RE.test(trimmed)) {
    return null;
  }
  const timestamp = Date.parse(trimmed.replace(/\bat\b/i, ""));
  if (!Number.isFinite(timestamp)) return null;

  const hasTime = /\d{1,2}:\d{2}/.test(trimmed);
  const hasYear = /\b\d{4}\b/.test(trimmed);
  const hasWeekday = ENGLISH_WEEKDAY_RE.test(trimmed);
  return new Intl.DateTimeFormat("zh-CN", {
    ...(hasWeekday ? { weekday: "long" as const } : {}),
    ...(hasYear ? { year: "numeric" as const } : {}),
    month: "long",
    day: "numeric",
    ...(hasTime
      ? { hour: "numeric" as const, minute: "2-digit" as const }
      : {}),
  }).format(new Date(timestamp));
}

/**
 * Translate audited user-visible copy while preserving dynamic values.
 *
 * Unlike `formatMessage`, this function accepts source copy rather than a
 * typed key. It is the compatibility layer for legacy desktop surfaces while
 * they are migrated to keyed messages.
 */
export function translateUserVisibleText(
  locale: SupportedLocale,
  source: string,
): string {
  if (locale === "en" || source.length === 0) return source;

  const exact = exactMessages.get(source);
  if (exact) return exact;

  for (const translation of templateMessages) {
    const match = translation.pattern.exec(source);
    if (!match) continue;
    return fillTemplate(translation.translatedTemplate, match.slice(1));
  }

  const localizedDateTime = translateEnglishDateTime(source);
  if (localizedDateTime) return localizedDateTime;

  return source;
}

let currentLocale: SupportedLocale = "en";

/** Keep non-React notification and native bridge call sites in sync. */
export function setCurrentLiteralLocale(locale: SupportedLocale): void {
  currentLocale = locale;
}

/** Return the locale used by non-React user-visible surfaces. */
export function getCurrentLiteralLocale(): SupportedLocale {
  return currentLocale;
}

/** Translate audited copy from a non-React call site using the active locale. */
export function translateCurrentUserVisibleText(source: string): string {
  return translateUserVisibleText(currentLocale, source);
}
