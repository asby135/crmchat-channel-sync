import { describe, it, expect } from "vitest";
import { determineMyChatMemberAction, formatMyChatMemberLog } from "./my-chat-member.js";
import { t } from "../i18n/index.js";

describe("determineMyChatMemberAction", () => {
  it("member -> administrator in channel = promoted", () => {
    expect(determineMyChatMemberAction("member", "administrator", "channel")).toBe("promoted");
  });

  it("member -> administrator in supergroup = promoted", () => {
    expect(determineMyChatMemberAction("member", "administrator", "supergroup")).toBe("promoted");
  });

  it("member -> administrator in group = promoted", () => {
    expect(determineMyChatMemberAction("member", "administrator", "group")).toBe("promoted");
  });

  it("member -> creator in channel = promoted", () => {
    expect(determineMyChatMemberAction("member", "creator", "channel")).toBe("promoted");
  });

  it("left -> administrator in channel = promoted", () => {
    expect(determineMyChatMemberAction("left", "administrator", "channel")).toBe("promoted");
  });

  it("administrator -> left in channel = demoted", () => {
    expect(determineMyChatMemberAction("administrator", "left", "channel")).toBe("demoted");
  });

  it("administrator -> kicked in channel = demoted", () => {
    expect(determineMyChatMemberAction("administrator", "kicked", "channel")).toBe("demoted");
  });

  it("member -> left in channel = demoted", () => {
    expect(determineMyChatMemberAction("member", "left", "channel")).toBe("demoted");
  });

  it("member -> restricted in channel = ignore", () => {
    expect(determineMyChatMemberAction("member", "restricted", "channel")).toBe("ignore");
  });

  it("administrator -> administrator in channel = ignore (no change)", () => {
    expect(determineMyChatMemberAction("administrator", "administrator", "channel")).toBe("ignore");
  });

  it("member -> administrator in private chat = ignore", () => {
    expect(determineMyChatMemberAction("member", "administrator", "private")).toBe("ignore");
  });

  it("member -> administrator in unknown chat type = ignore", () => {
    expect(determineMyChatMemberAction("member", "administrator", "sender")).toBe("ignore");
  });
});

describe("formatMyChatMemberLog", () => {
  it("identifies who added the bot where, and what happened", () => {
    const line = formatMyChatMemberLog({
      chatId: -1001234567890,
      chatType: "channel",
      title: "Подписчики основного ТГ-канала",
      fromId: 466555920,
      oldStatus: "left",
      newStatus: "administrator",
      result: "no_session_dm_failed",
    });

    expect(line).toBe(
      '[my_chat_member] chat=-1001234567890 type=channel title="Подписчики основного ТГ-канала" ' +
        "from=466555920 left->administrator result=no_session_dm_failed",
    );
  });

  it("quotes titles so spaces and quotes can't break the line apart", () => {
    const line = formatMyChatMemberLog({
      chatId: 1,
      chatType: "channel",
      title: 'A "quoted" title',
      fromId: 2,
      oldStatus: "administrator",
      newStatus: "administrator",
      result: "ignored",
    });

    expect(line).toContain('title="A \\"quoted\\" title"');
  });
});

describe("empty channel list messages", () => {
  // Customers who connect a workspace from one Telegram account and add the
  // bot from another end up here with no explanation otherwise.
  it("tell the customer about the other-account case in both languages", () => {
    for (const [lang, phrase] of [
      ["en", "different Telegram account"],
      ["ru", "другого Telegram-аккаунта"],
    ] as const) {
      const l = t(lang);
      expect(l.settingsNoChannels).toContain(phrase);
      expect(l.syncNoChannels).toContain(phrase);
      expect(l.mainMenuNoChannels("WS")).toContain(phrase);
    }
  });
});
