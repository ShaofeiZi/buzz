import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMessage,
  isLanguagePreference,
  resolveLocale,
  resolveSystemLocale,
} from "./i18n.ts";
import { enMessages } from "./messages/en.ts";
import { zhCNMessages } from "./messages/zh-CN.ts";

test("resolveSystemLocale selects Simplified Chinese for any Chinese locale", () => {
  assert.equal(resolveSystemLocale(["zh-CN"]), "zh-CN");
  assert.equal(resolveSystemLocale(["zh-Hant", "en-US"]), "zh-CN");
  assert.equal(resolveSystemLocale(["fr-FR", "zh-TW"]), "zh-CN");
});

test("resolveSystemLocale respects browser language priority", () => {
  assert.equal(resolveSystemLocale(["en-US", "zh-CN"]), "en");
  assert.equal(resolveSystemLocale(["zh-CN", "en-US"]), "zh-CN");
});

test("resolveSystemLocale defaults to English", () => {
  assert.equal(resolveSystemLocale(undefined), "en");
  assert.equal(resolveSystemLocale([]), "en");
  assert.equal(resolveSystemLocale(["fr-FR", "de-DE"]), "en");
});

test("explicit language preference overrides the system locale", () => {
  assert.equal(resolveLocale("en", ["zh-CN"]), "en");
  assert.equal(resolveLocale("zh-CN", ["en-US"]), "zh-CN");
  assert.equal(resolveLocale("system", ["zh-CN"]), "zh-CN");
});

test("language preference validation fails closed", () => {
  for (const value of ["system", "en", "zh-CN"]) {
    assert.equal(isLanguagePreference(value), true);
  }
  for (const value of [null, "", "zh", "fr", 1]) {
    assert.equal(isLanguagePreference(value), false);
  }
});

test("formatMessage returns localized copy and interpolates parameters", () => {
  assert.equal(formatMessage("zh-CN", "settings.backToApp"), "返回应用");
  assert.equal(
    formatMessage("zh-CN", "language.systemResolved", {
      language: "简体中文",
    }),
    "当前使用简体中文",
  );
  assert.equal(
    formatMessage("en", "language.systemResolved", { language: "English" }),
    "Currently using English",
  );
});

test("Simplified Chinese and English dictionaries have identical keys", () => {
  assert.deepEqual(
    Object.keys(zhCNMessages).sort(),
    Object.keys(enMessages).sort(),
  );
});
