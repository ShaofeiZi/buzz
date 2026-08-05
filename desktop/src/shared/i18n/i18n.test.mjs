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
import { zhCNLiteralMessages } from "./messages/zh-CN-literals.ts";
import { zhCNLiteralOverrides } from "./messages/zh-CN-literal-overrides.ts";
import { translateUserVisibleText } from "./literalTranslation.ts";
import { auditUserVisibleStrings } from "../../../scripts/audit-user-visible-strings.mjs";

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

test("every audited literal user-visible string has a Simplified Chinese translation", () => {
  const sources = new Set(
    auditUserVisibleStrings().map((finding) => finding.text),
  );
  const missing = [...sources].filter(
    (source) => zhCNLiteralMessages[source] === undefined,
  );
  assert.deepEqual(missing, []);
});

test("literal translations preserve every dynamic value token", () => {
  for (const [source, translated] of Object.entries({
    ...zhCNLiteralMessages,
    ...zhCNLiteralOverrides,
  })) {
    assert.equal(
      translated.match(/\{\{value\}\}/g)?.length ?? 0,
      source.match(/\{\{value\}\}/g)?.length ?? 0,
      source,
    );
  }
});

test("literal translations localize exact copy and preserve dynamic values", () => {
  assert.equal(
    translateUserVisibleText("zh-CN", "Search everything"),
    "搜索全部内容",
  );
  assert.equal(
    translateUserVisibleText("zh-CN", "Open profile for Alice"),
    "打开 Alice 的个人资料",
  );
  assert.equal(
    translateUserVisibleText("en", "Search everything"),
    "Search everything",
  );
  assert.equal(
    translateUserVisibleText("zh-CN", "What this channel is for"),
    "此频道的用途",
  );
  assert.equal(translateUserVisibleText("zh-CN", "Create project"), "创建项目");
  assert.equal(
    translateUserVisibleText("zh-CN", "Remove this agent from the huddle?"),
    "将此智能体移出语音会议？",
  );
});

test("literal translations localize English clock and date output", () => {
  assert.match(translateUserVisibleText("zh-CN", "8:00 PM"), /20:00/);
  assert.match(
    translateUserVisibleText("zh-CN", "Aug 5, 2026, 8:00 PM"),
    /2026年8月5日/,
  );
});
