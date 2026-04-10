import { describe, it, expect } from "vitest";
import { determineMyChatMemberAction } from "./my-chat-member.js";

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
