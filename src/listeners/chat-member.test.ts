import { describe, it, expect } from "vitest";
import { classifyChatMemberChange } from "./chat-member.js";

describe("classifyChatMemberChange", () => {
  // Join cases
  it("left -> member = joined", () => {
    expect(classifyChatMemberChange("left", "member")).toBe("joined");
  });

  it("kicked -> member = joined", () => {
    expect(classifyChatMemberChange("kicked", "member")).toBe("joined");
  });

  it("restricted -> member = joined", () => {
    expect(classifyChatMemberChange("restricted", "member")).toBe("joined");
  });

  // Leave cases
  it("member -> left = left", () => {
    expect(classifyChatMemberChange("member", "left")).toBe("left");
  });

  it("member -> kicked = left", () => {
    expect(classifyChatMemberChange("member", "kicked")).toBe("left");
  });

  it("administrator -> left = left", () => {
    expect(classifyChatMemberChange("administrator", "left")).toBe("left");
  });

  // Ignore cases
  it("member -> administrator = ignore (promotion, not a join)", () => {
    expect(classifyChatMemberChange("member", "administrator")).toBe("ignore");
  });

  it("administrator -> member = ignore (demotion, not a leave)", () => {
    expect(classifyChatMemberChange("administrator", "member")).toBe("ignore");
  });

  it("left -> left = ignore", () => {
    expect(classifyChatMemberChange("left", "left")).toBe("ignore");
  });
});
