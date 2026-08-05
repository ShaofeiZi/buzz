import { LanguageSelector } from "@/shared/i18n/LanguageSelector";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { SettingsSectionHeader } from "./SettingsSectionHeader";

/** Settings panel for choosing the persisted desktop language preference. */
export function LanguageSettingsCard() {
  const { t } = useI18n();

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-testid="settings-language"
    >
      <SettingsSectionHeader
        description={t("language.description")}
        title={t("language.label")}
      />
      <LanguageSelector />
    </section>
  );
}
