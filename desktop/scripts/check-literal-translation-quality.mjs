import { auditUserVisibleStrings } from "./audit-user-visible-strings.mjs";
import { zhCNLiteralMessages } from "../src/shared/i18n/messages/zh-CN-literals.ts";
import { zhCNLiteralOverrides } from "../src/shared/i18n/messages/zh-CN-literal-overrides.ts";

const translations = {
  ...zhCNLiteralMessages,
  ...zhCNLiteralOverrides,
};
const sources = new Set(
  auditUserVisibleStrings().map((finding) => finding.text),
);

const failures = [];

for (const source of sources) {
  const translated = translations[source];
  if (translated === undefined) {
    failures.push(`${JSON.stringify(source)}: missing translation`);
    continue;
  }

  const sourceTokens = source.match(/\{\{value\}\}/g)?.length ?? 0;
  const translatedTokens = translated.match(/\{\{value\}\}/g)?.length ?? 0;
  if (sourceTokens !== translatedTokens) {
    failures.push(
      `${JSON.stringify(source)}: expected ${sourceTokens} value tokens, found ${translatedTokens}`,
    );
  }
}

const forbiddenPatterns = [
  [/ZXQ[A-Z0-9]+QXZ/, "temporary placeholder leaked"],
  [/(项目|标签|智能体|应用|运行环境)\1/, "duplicated Chinese term"],
  [/\bIntelligent Agent\b/i, "untranslated agent term"],
  [/(?:人体|人类)模型/, "Anthropic mistranslation"],
  [/Buzz术语/, "Buzz Term mistranslation"],
  [/应用程序/, "awkward app terminology"],
  [/钥匙圈/, "non-product keyring terminology"],
  [/卡牌|铸造/, "non-product card terminology"],
  [/型号/, "model mistranslation"],
  [/会员/, "member mistranslation"],
  [/代理/, "agent mistranslation"],
  [/[，。！？；：]\s/, "space after Chinese punctuation"],
  [/\s[，。！？；：]/, "space before Chinese punctuation"],
];

for (const [source, translated] of Object.entries(translations)) {
  for (const [pattern, reason] of forbiddenPatterns) {
    if (pattern.test(translated)) {
      failures.push(
        `${JSON.stringify(source)} => ${JSON.stringify(translated)}: ${reason}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(
    `Literal translation quality check failed with ${failures.length} issue(s):`,
  );
  for (const failure of failures.slice(0, 200)) {
    console.error(`- ${failure}`);
  }
  if (failures.length > 200) {
    console.error(`- ... ${failures.length - 200} more`);
  }
  process.exit(1);
}

console.log(
  `Validated ${sources.size} audited user-visible translations with no known quality regressions.`,
);
