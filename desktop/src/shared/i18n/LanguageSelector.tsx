import { Check, Languages } from "lucide-react";

import { useI18n } from "./I18nProvider";
import {
  languagePreferences,
  resolveSystemLocale,
  type LanguagePreference,
} from "./i18n";
import { cn } from "@/shared/lib/cn";

const languageMessageKeys: Record<
  LanguagePreference,
  "language.system" | "language.english" | "language.simplifiedChinese"
> = {
  system: "language.system",
  en: "language.english",
  "zh-CN": "language.simplifiedChinese",
};

/** Render the shared system/English/Simplified-Chinese preference control. */
export function LanguageSelector({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { preference, setPreference, t } = useI18n();
  const systemLocale = resolveSystemLocale(
    typeof navigator === "undefined" ? [] : navigator.languages,
  );
  const systemLanguage =
    systemLocale === "zh-CN"
      ? t("language.simplifiedChinese")
      : t("language.english");

  return (
    <div
      className={cn(
        compact
          ? "flex flex-wrap justify-center gap-2"
          : "grid gap-2 sm:grid-cols-3",
        className,
      )}
      data-testid="language-selector"
    >
      {languagePreferences.map((language) => {
        const selected = preference === language;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
              compact && "min-h-9 rounded-full bg-background/35 px-4",
            )}
            data-testid={`language-option-${language}`}
            key={language}
            onClick={() => setPreference(language)}
            type="button"
          >
            {language === "system" ? (
              <Languages className="h-4 w-4" aria-hidden="true" />
            ) : null}
            <span>{t(languageMessageKeys[language])}</span>
            {selected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
            {language === "system" && !compact ? (
              <span className="sr-only">
                {t("language.systemResolved", { language: systemLanguage })}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
