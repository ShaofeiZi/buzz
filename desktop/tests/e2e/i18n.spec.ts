import { expect, test } from "@playwright/test";

import {
  installMockBridge,
  openCreateChannelDialog,
  TEST_IDENTITIES,
} from "../helpers/bridge";
import { seedActiveIdentity } from "../helpers/onboarding";
import { openProfileMenu, openSettings } from "../helpers/settings";
import { zhCNLiteralMessages } from "../../src/shared/i18n/messages/zh-CN-literals";
import { zhCNLiteralOverrides } from "../../src/shared/i18n/messages/zh-CN-literal-overrides";

const literalTranslations = {
  ...zhCNLiteralMessages,
  ...zhCNLiteralOverrides,
};

const untranslatedExactSources = Object.entries(literalTranslations)
  .filter(
    ([source, translated]) =>
      source !== translated && !source.includes("{{value}}"),
  )
  .map(([source]) => source);

const untranslatedTemplateSources = Object.entries(literalTranslations)
  .filter(
    ([source, translated]) =>
      source !== translated &&
      source.includes("{{value}}") &&
      /[A-Za-z]{2,}/.test(source.replaceAll("{{value}}", "")),
  )
  .map(([source]) => source);

async function expectNoAuditedEnglishCopy(
  page: import("@playwright/test").Page,
  surface: string,
) {
  const findings = await page.evaluate(
    ({ exactSources, templateSources }) => {
      const exact = new Set(exactSources);
      const templates = templateSources.map((source) => {
        const parts = source
          .split("{{value}}")
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        return {
          source,
          pattern: new RegExp(`^${parts.join("(.+?)")}$`, "u"),
        };
      });
      const skipSelector = [
        "[contenteditable='true']",
        "[data-i18n-skip]",
        "[data-message-content]",
        "[data-user-content]",
        ".message-markdown",
        "code",
        "pre",
        "script",
        "style",
        "textarea",
      ].join(",");
      const isVisible = (element: Element | null) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          element.getClientRects().length > 0
        );
      };
      const matchesSource = (value: string) => {
        const normalized = value.replace(/\s+/g, " ").trim();
        if (!normalized) return null;
        if (exact.has(normalized)) return normalized;
        return (
          templates.find(({ pattern }) => pattern.test(normalized))?.source ??
          null
        );
      };
      const results: Array<{
        kind: string;
        source: string;
        value: string;
      }> = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (parent && !parent.closest(skipSelector) && isVisible(parent)) {
          const value = node.nodeValue ?? "";
          const source = matchesSource(value);
          if (source) results.push({ kind: "text", source, value });
        }
        node = walker.nextNode();
      }
      for (const element of document.querySelectorAll(
        "[aria-label], [placeholder], [title]",
      )) {
        if (element.closest(skipSelector) || !isVisible(element)) continue;
        for (const attribute of ["aria-label", "placeholder", "title"]) {
          const value = element.getAttribute(attribute);
          if (!value) continue;
          const source = matchesSource(value);
          if (source) {
            results.push({ kind: attribute, source, value });
          }
        }
      }
      return results.slice(0, 50);
    },
    {
      exactSources: untranslatedExactSources,
      templateSources: untranslatedTemplateSources,
    },
  );

  expect(findings, `${surface} still exposes audited English copy`).toEqual([]);
}

async function expectLocalizedTextarea(
  textarea: import("@playwright/test").Locator,
  expectedPlaceholder: string,
) {
  const userContent = "User-authored English content must stay unchanged.";
  await expect(textarea).toHaveAttribute("placeholder", expectedPlaceholder);
  await textarea.fill(userContent);
  await expect(textarea).toHaveValue(userContent);
}

async function collectVisibleEnglishCopy(
  page: import("@playwright/test").Page,
) {
  return page.evaluate(() => {
    const skipSelector = [
      "[contenteditable='true']",
      "[data-i18n-skip]",
      "[data-message-content]",
      "[data-user-content]",
      ".message-markdown",
      "code",
      "pre",
      "script",
      "style",
      "textarea",
    ].join(",");
    const allowedTechnicalCopy =
      /^(?:ACP|API|AppImage|Anthropic|Block|Builderlab|Buzz|ChatGPT|Claude|Codex|Databricks|Git|GitHub|GPT|HTTP|HTTPS|JSON|Markdown|Mesh|NIP-\d+|Node\.js|Nostr|OpenAI|OpenRouter|PNG|Pocket TTS|Relay|STT|TTS|URL|WebSocket|YAML)(?:\b|$)/;
    const looksLikeEnglishSentence = (value: string) => {
      const normalized = value.replace(/\s+/g, " ").trim();
      if (!normalized || /[\u3400-\u9fff]/u.test(normalized)) return false;
      if (!/[A-Za-z]{2,}/.test(normalized)) return false;
      if (allowedTechnicalCopy.test(normalized)) return false;
      if (
        /^(?:general|random|design|sales|engineering|agents|watercooler|announcements)$/i.test(
          normalized,
        )
      ) {
        return false;
      }
      if (
        /^(?:[a-z0-9_.:/@#-]+|[A-Z][A-Za-z0-9_.-]*(?:\s+[A-Z][A-Za-z0-9_.-]*)?)$/u.test(
          normalized,
        )
      ) {
        return false;
      }
      return /\b(?:a|an|and|are|can|create|delete|edit|for|from|in|is|load|new|not|of|on|open|or|save|search|select|the|this|to|with|you|your)\b/i.test(
        normalized,
      );
    };
    const isVisible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        element.getClientRects().length > 0
      );
    };
    const findings = new Set<string>();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && !parent.closest(skipSelector) && isVisible(parent)) {
        const value = node.nodeValue ?? "";
        if (looksLikeEnglishSentence(value)) {
          findings.add(value.replace(/\s+/g, " ").trim());
        }
      }
      node = walker.nextNode();
    }
    for (const element of document.querySelectorAll(
      "[aria-label], [placeholder], [title]",
    )) {
      if (element.closest(skipSelector) || !isVisible(element)) continue;
      for (const attribute of ["aria-label", "placeholder", "title"]) {
        const value = element.getAttribute(attribute);
        if (value && looksLikeEnglishSentence(value)) {
          findings.add(value.replace(/\s+/g, " ").trim());
        }
      }
    }
    return [...findings].sort();
  });
}

test("switches first-launch onboarding to Simplified Chinese immediately", async ({
  page,
}) => {
  await installMockBridge(page, undefined, {
    skipCommunitySeed: true,
    skipOnboardingSeed: true,
  });
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Use an existing key" }),
  ).toBeVisible();
  await page.getByTestId("language-option-zh-CN").click();

  await expect(
    page.getByRole("button", { name: "使用现有密钥" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("buzz-language")))
    .toBe("zh-CN");

  await page.getByRole("button", { name: "使用现有密钥" }).click();
  await expect(
    page.getByRole("heading", { name: "输入你的私钥" }),
  ).toBeVisible();
  await expect(page.getByTestId("nostr-import-nsec-input")).toHaveAttribute(
    "placeholder",
    "在此输入密钥",
  );

  await page.reload();
  await expect(
    page.getByRole("button", { name: "使用现有密钥" }),
  ).toBeVisible();
});

test("changes language from settings and updates the app shell without reload", async ({
  page,
}) => {
  await installMockBridge(page);
  await page.goto("/");

  await expect(page.getByTestId("app-sidebar")).toContainText("Inbox");
  await openSettings(page, "language");
  await expect(
    page.getByTestId("settings-language").getByRole("heading", {
      name: "Language",
    }),
  ).toBeVisible();

  await page.getByTestId("language-option-zh-CN").click();
  await expect(
    page.getByTestId("settings-language").getByRole("heading", {
      name: "语言",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("settings-nav-profile")).toContainText(
    "个人资料",
  );
  await expect(page.getByTestId("settings-back-to-app")).toContainText(
    "返回应用",
  );

  await page.getByTestId("settings-back-to-app").click();
  await expect(page.getByTestId("app-sidebar")).toContainText("收件箱");
  await expect(page.getByTestId("app-sidebar")).toContainText("频道");
  await expect(page.getByTestId("app-sidebar")).toContainText("私信");

  await page.reload();
  await expect(page.getByTestId("app-sidebar")).toContainText("收件箱");

  await openSettings(page, "language");
  await page.getByTestId("language-option-en").click();
  await expect(
    page.getByTestId("settings-language").getByRole("heading", {
      name: "Language",
    }),
  ).toBeVisible();
});

test("renders the first-community connection flow in Simplified Chinese", async ({
  page,
}) => {
  await seedActiveIdentity(page, TEST_IDENTITIES.tyler);
  await page.addInitScript((pubkey) => {
    localStorage.setItem("buzz-language", "zh-CN");
    localStorage.setItem(
      `buzz-machine-onboarding-complete.v2:${pubkey}`,
      "true",
    );
  }, TEST_IDENTITIES.tyler.pubkey);
  await installMockBridge(page, undefined, {
    skipCommunitySeed: true,
    skipOnboardingSeed: true,
  });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "加入或创建社区" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "加入社区" })).toBeVisible();
  await expect(page.getByRole("button", { name: "创建社区" })).toBeVisible();
  await expect(page.getByRole("button", { name: "我已有社区" })).toBeVisible();

  await page.getByRole("button", { name: "加入社区" }).click();
  await expect(page.getByRole("heading", { name: "加入社区" })).toBeVisible();
  await expect(page.getByText("要加入私有社区？")).toBeVisible();
  await expect(page.getByTestId("invite-redeem-input")).toHaveAttribute(
    "placeholder",
    "邀请链接或社区地址",
  );
  await page.getByTestId("invite-redeem-input").fill("ws://10.37.127.68:13000");
  await expect(page.getByTestId("invite-redeem-submit")).toContainText(
    "下一步",
  );
});

test("localizes primary lazy-loaded surfaces without translating user content", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("buzz-language", "zh-CN");
  });
  await installMockBridge(page);
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expectNoAuditedEnglishCopy(page, "home");

  await page.getByTestId("open-search").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoAuditedEnglishCopy(page, "search");
  await page.keyboard.press("Escape");

  await openSettings(page, "profile");
  await expectNoAuditedEnglishCopy(page, "profile settings");
  for (const section of [
    "appearance",
    "experimental",
    "notifications",
    "voice",
    "agents",
    "channel-templates",
    "compute",
    "appearance",
    "language",
    "shortcuts",
    "hosted-communities",
    "community-members",
    "moderation",
    "custom-emoji",
    "local-archive",
    "mobile",
    "updates",
  ]) {
    const nav = page.getByTestId(`settings-nav-${section}`);
    if ((await nav.count()) === 0 || !(await nav.isVisible())) continue;
    await nav.click();
    await expectNoAuditedEnglishCopy(page, `${section} settings`);
  }
  await page.getByTestId("settings-back-to-app").click();

  await page.getByTestId("channel-general").click();
  await expect(page.getByTestId("chat-title")).toHaveText("general");
  const copyChannelName = page.getByRole("button", {
    name: "复制频道名称：general",
  });
  await expect(copyChannelName).toBeVisible();
  await copyChannelName.click();
  await page.evaluate(() => {
    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.textContent = "Channel name copied";
    document.body.append(toast);
  });
  await expect(page.getByText("频道名称已复制")).toBeVisible();
  await expectNoAuditedEnglishCopy(page, "channel");

  const firstMessage = page.getByTestId("message-row").first();
  const originalMessage = (await firstMessage.textContent()) ?? "";
  await firstMessage.hover();
  await expectNoAuditedEnglishCopy(page, "message actions");
  await expect(firstMessage).toContainText(
    originalMessage.replace(/\s+/g, " ").trim().slice(0, 24),
  );

  for (const [testId, surface] of [
    ["open-pulse-view", "pulse"],
    ["open-projects-view", "projects"],
    ["open-agents-view", "agents"],
    ["open-workflows-view", "workflows"],
  ] as const) {
    const trigger = page.getByTestId(testId);
    if ((await trigger.count()) === 0 || !(await trigger.isVisible())) continue;
    await trigger.click();
    await expectNoAuditedEnglishCopy(page, surface);
  }
});

test("localizes user-input surfaces without rewriting entered content", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("buzz-language", "zh-CN");
  });
  await installMockBridge(page);
  await page.goto("/");

  await openCreateChannelDialog(page);
  const channelDialog = page.getByTestId("create-channel-dialog");
  await expect(channelDialog).toBeVisible();
  await expectNoAuditedEnglishCopy(page, "create channel dialog");
  await expectLocalizedTextarea(
    page.getByTestId("create-channel-description"),
    "此频道的用途",
  );
  await page.keyboard.press("Escape");

  await openProfileMenu(page);
  await page.getByTestId("profile-popover-send-feedback").click();
  const feedbackDialog = page.getByTestId("send-feedback-dialog");
  await expect(feedbackDialog).toBeVisible();
  await expectNoAuditedEnglishCopy(page, "feedback dialog");
  await expectLocalizedTextarea(
    page.getByTestId("feedback-message"),
    "告诉我们哪里出了问题，或分享其他反馈。",
  );
  await page.keyboard.press("Escape");

  await page.getByTestId("open-projects-view").click();
  const createMenu = page.getByTestId("projects-create-menu");
  await createMenu.hover();
  await page.getByRole("menuitem", { name: "项目" }).click();
  const projectDialog = page.getByTestId("create-project-dialog");
  await expect(projectDialog).toBeVisible();
  await expectNoAuditedEnglishCopy(page, "create project dialog");
  const description = page.getByTestId("create-project-description");
  await description.fill("Project description entered by the user.");
  await expect(description).toHaveValue(
    "Project description entered by the user.",
  );
});

test("does not expose ordinary English sentences on primary Chinese surfaces", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("buzz-language", "zh-CN");
  });
  await installMockBridge(page);
  await page.goto("/");

  const findings: Record<string, string[]> = {};
  findings.home = await collectVisibleEnglishCopy(page);

  await openSettings(page, "profile");
  for (const section of [
    "profile",
    "appearance",
    "language",
    "notifications",
    "voice",
    "shortcuts",
    "custom-emoji",
    "local-archive",
    "channel-templates",
    "hosted-communities",
    "agents",
    "compute",
    "experimental",
    "mobile",
    "updates",
  ]) {
    const nav = page.getByTestId(`settings-nav-${section}`);
    if ((await nav.count()) === 0 || !(await nav.isVisible())) continue;
    await nav.click();
    findings[`settings:${section}`] = await collectVisibleEnglishCopy(page);
  }
  await page.getByTestId("settings-back-to-app").click();

  for (const [testId, surface] of [
    ["open-pulse-view", "pulse"],
    ["open-projects-view", "projects"],
    ["open-agents-view", "agents"],
    ["open-workflows-view", "workflows"],
  ] as const) {
    const trigger = page.getByTestId(testId);
    if ((await trigger.count()) === 0 || !(await trigger.isVisible())) continue;
    await trigger.click();
    findings[surface] = await collectVisibleEnglishCopy(page);
  }

  const nonEmpty = Object.fromEntries(
    Object.entries(findings).filter(([, values]) => values.length > 0),
  );
  expect(nonEmpty).toEqual({});
});
