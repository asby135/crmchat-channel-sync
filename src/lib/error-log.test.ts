import { describe, it, expect } from "vitest";
import type { Update } from "telegraf/types";
import { describeUpdateForLog, describeErrorForLog } from "./error-log.js";

describe("describeUpdateForLog", () => {
  // Regression: Telegraf's default handler logged the full update, and users
  // paste their CRMChat API key straight into the chat.
  it("never includes message text", () => {
    const update = {
      update_id: 880301537,
      message: {
        message_id: 1609,
        date: 1789641687,
        chat: { id: 8598908534, type: "private", first_name: "Test" },
        from: { id: 8598908534, is_bot: false, first_name: "Test" },
        text: "sk_live_secret_key_value",
      },
    } as unknown as Update;

    const line = describeUpdateForLog(update);

    expect(line).not.toContain("sk_");
    expect(line).toBe("update_id=880301537 type=message chat=8598908534 from=8598908534");
  });

  it("finds the chat on a callback query", () => {
    const update = {
      update_id: 1,
      callback_query: {
        id: "q",
        from: { id: 42, is_bot: false, first_name: "A" },
        message: { message_id: 5, date: 0, chat: { id: 42, type: "private" } },
        data: "ws_page:1",
      },
    } as unknown as Update;

    expect(describeUpdateForLog(update)).toBe("update_id=1 type=callback_query chat=42 from=42");
  });
});

describe("describeErrorForLog", () => {
  it("uses the stack for errors and stringifies anything else", () => {
    expect(describeErrorForLog(new Error("boom"))).toContain("boom");
    expect(describeErrorForLog("plain")).toBe("plain");
  });
});
