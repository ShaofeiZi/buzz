import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import {
  eligibleFeedNotificationItems,
  enrichFeedItemChannel,
  notificationBody,
  notificationTitle,
} from "./feed.ts";
import { setCurrentLiteralLocale } from "../../../shared/i18n/literalTranslation.ts";

beforeEach(() => {
  setCurrentLiteralLocale("en");
});

afterEach(() => {
  setCurrentLiteralLocale("en");
});

const feedItem = (overrides = {}) => ({
  id: "event-id",
  kind: 46011,
  pubkey: "author",
  content: "Please review",
  createdAt: 1,
  channelId: "channel-id",
  channelName: "",
  channelType: undefined,
  tags: [["h", "channel-id"]],
  category: "needs_action",
  ...overrides,
});

const channels = [
  { id: "channel-id", name: "ship-room", channelType: "stream" },
];

test("enriches a feed notification with its loaded channel name", () => {
  const item = enrichFeedItemChannel(feedItem(), channels);

  assert.equal(item.channelName, "ship-room");
  assert.equal(item.channelType, "stream");
  assert.equal(notificationTitle(item), "Needs Action in #ship-room");
});

test("preserves feed-provided channel metadata", () => {
  const original = feedItem({
    channelName: "backend-name",
    channelType: "forum",
  });
  const item = enrichFeedItemChannel(original, channels);

  assert.equal(item, original);
  assert.equal(notificationTitle(item), "Needs Action in #backend-name");
});

test("falls back safely when the channel list has not loaded the channel", () => {
  const original = feedItem();
  const item = enrichFeedItemChannel(original, []);

  assert.equal(item, original);
  assert.equal(notificationTitle(item), "Needs Action");
});

test("does not replace direct-message notification titles", () => {
  const original = feedItem({ channelType: "dm" });
  const item = enrichFeedItemChannel(original, [
    { id: "channel-id", name: "not-a-title", channelType: "dm" },
  ]);

  assert.equal(notificationTitle(item, "Taylor"), "Taylor");
});

test("localizes generated notification copy without translating user content", () => {
  setCurrentLiteralLocale("zh-CN");
  const mention = feedItem({
    category: "mention",
    channelName: "general",
    channelType: "stream",
  });
  const approval = feedItem({
    content: "",
    kind: 46010,
    channelName: "general",
    channelType: "stream",
  });

  assert.equal(
    notificationTitle(mention, "Alice"),
    "Alice 提及了你 · #general",
  );
  assert.equal(
    notificationTitle(approval, "Alice"),
    "Alice 请求你审批 · #general",
  );
  assert.equal(notificationBody(approval), "有一个工作流正在等待你审批。");
  assert.equal(notificationBody(mention), "Please review");
});

const feedResponse = (mentions, needsAction = []) => ({
  feed: { mentions, needsAction },
});

const allSlots = { mentions: true, needsAction: true };

test("excludes a DM mention whose feed item is missing channel metadata but whose channel is loaded", () => {
  // The backend feed emits channel_type: None and channel_name: "" for DMs;
  // the DM-exclusion guard must resolve the type from the channel list
  // BEFORE filtering, or every DM double-notifies alongside the WS path.
  const dmItem = feedItem({
    category: "mention",
    channelId: "dm-channel",
    channelName: "",
    channelType: undefined,
  });
  const items = eligibleFeedNotificationItems(
    feedResponse([dmItem]),
    allSlots,
    [{ id: "dm-channel", name: "alice-tyler", channelType: "dm" }],
  );

  assert.equal(items.length, 0);
});

test("keeps a mention eligible when its channel is not in the loaded channel list", () => {
  // Unknown DM channels get no WS notification (handleDmEvent bails on
  // unknown channels), so the feed path must remain the failover.
  const unknownItem = feedItem({
    category: "mention",
    channelId: "brand-new-dm",
    channelName: "",
    channelType: undefined,
  });
  const items = eligibleFeedNotificationItems(
    feedResponse([unknownItem]),
    allSlots,
    [{ id: "some-other-channel", name: "general", channelType: "stream" }],
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].id, unknownItem.id);
});

test("resolves and excludes a DM whose feed item has a name but no type", () => {
  const namedItem = feedItem({
    category: "mention",
    channelId: "dm-channel",
    channelName: "alice-tyler",
    channelType: undefined,
  });
  const items = eligibleFeedNotificationItems(
    feedResponse([namedItem]),
    allSlots,
    [{ id: "dm-channel", name: "alice-tyler", channelType: "dm" }],
  );

  assert.equal(items.length, 0);
});
