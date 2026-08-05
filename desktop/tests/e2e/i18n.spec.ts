import { expect, test } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";
import { seedActiveIdentity } from "../helpers/onboarding";
import { openSettings } from "../helpers/settings";

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
