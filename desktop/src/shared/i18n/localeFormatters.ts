import type { SupportedLocale } from "./i18n";
import { getCurrentLiteralLocale } from "./literalTranslation";

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function cacheKey(
  locale: SupportedLocale,
  options: Intl.DateTimeFormatOptions | Intl.RelativeTimeFormatOptions,
): string {
  return `${locale}:${JSON.stringify(options)}`;
}

/** Format a date using the language selected inside Buzz. */
export function formatLocalizedDateTime(
  value: Date | number,
  options: Intl.DateTimeFormatOptions,
): string {
  const locale = getCurrentLiteralLocale();
  const key = cacheKey(locale, options);
  let formatter = dateTimeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

/** Format a relative time using the language selected inside Buzz. */
export function formatLocalizedRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options: Intl.RelativeTimeFormatOptions = { numeric: "auto" },
): string {
  const locale = getCurrentLiteralLocale();
  const key = cacheKey(locale, options);
  let formatter = relativeTimeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, options);
    relativeTimeFormatters.set(key, formatter);
  }
  return formatter.format(value, unit);
}
