import { describe, it, expect } from "vitest";
import { ApiError, ApiAuthError, RateLimitError } from "../api/client.js";
import { t } from "../i18n/index.js";
import { classifyBotError, localizeBotError, technicalCode } from "./api-errors.js";

const en = t("en");
const ru = t("ru");

/** Errors reach the bot exactly like this — see extractErrorDetail in api/client.ts. */
function telegramError(code: string): ApiError {
  return new ApiError(`API error 400: ${code}`, 400, JSON.stringify({ message: code }));
}

describe("classifyBotError", () => {
  it("tells 'not in the channel' apart from 'not an admin'", () => {
    expect(classifyBotError(telegramError("CHANNEL_INVALID")).kind).toBe("channelNotVisible");
    expect(classifyBotError(telegramError("CHANNEL_PRIVATE")).kind).toBe("channelPrivate");
    expect(classifyBotError(telegramError("CHAT_ADMIN_REQUIRED")).kind).toBe("adminRequired");
  });

  it("classifies the unresolved accessHash failure", () => {
    const err = new Error("Could not resolve accessHash for channel -1001175139738");
    expect(classifyBotError(err).kind).toBe("channelNotVisible");
  });

  it("extracts the wait from FLOOD_WAIT_N", () => {
    const classified = classifyBotError(telegramError("FLOOD_WAIT_42"));
    expect(classified).toEqual({ kind: "floodWait", seconds: 42 });
  });

  it("classifies a disconnected account", () => {
    expect(classifyBotError(telegramError("AUTH_KEY_UNREGISTERED")).kind).toBe(
      "accountDisconnected",
    );
    expect(
      classifyBotError(
        new ApiError("API error 412: This Telegram account is not connected.", 412),
      ).kind,
    ).toBe("accountDisconnected");
  });

  it("classifies auth and rate-limit errors by type", () => {
    expect(classifyBotError(new ApiAuthError()).kind).toBe("apiKeyInvalid");
    expect(classifyBotError(new RateLimitError(30))).toEqual({
      kind: "rateLimited",
      seconds: 30,
    });
  });

  it("recognises the ownerId validation failure", () => {
    const err = new ApiError(
      "API error 400: Input validation failed (ownerId: Property is required)",
      400,
    );
    expect(classifyBotError(err).kind).toBe("ownerRequired");
  });

  it("keeps NO_ACTIVE_TG_ACCOUNT working", () => {
    expect(classifyBotError(new Error("NO_ACTIVE_TG_ACCOUNT")).kind).toBe("noActiveAccount");
  });

  it("falls back to unknown with the original text", () => {
    expect(classifyBotError(new Error("something we've never seen"))).toEqual({
      kind: "unknown",
      detail: "something we've never seen",
    });
  });

  it("does not mistake a 503 for a Telegram code", () => {
    expect(classifyBotError(new ApiError("API error 503: Service Unavailable", 503)).kind).toBe(
      "telegramUnavailable",
    );
  });
});

describe("technicalCode", () => {
  it("pulls the Telegram code out of the message", () => {
    expect(technicalCode(telegramError("CHAT_ADMIN_REQUIRED"))).toBe("CHAT_ADMIN_REQUIRED");
    expect(technicalCode(telegramError("FLOOD_WAIT_42"))).toBe("FLOOD_WAIT_42");
  });

  it("returns undefined for prose", () => {
    expect(technicalCode(new Error("something broke"))).toBeUndefined();
  });
});

describe("localizeBotError", () => {
  it("explains admin-required in English with a concrete next step", () => {
    const text = localizeBotError(telegramError("CHAT_ADMIN_REQUIRED"), en);

    expect(text).toContain("isn't an admin");
    expect(text).toContain("Make it an admin");
    expect(text).not.toContain("API error 400");
  });

  it("explains admin-required in Russian", () => {
    const text = localizeBotError(telegramError("CHAT_ADMIN_REQUIRED"), ru);

    expect(text).toContain("не админ");
    expect(text).toContain("Назначь его админом");
  });

  // The whole point of the rewrite: a channel owner should read one screen,
  // not a numbered procedure. Guards against explanations creeping back up.
  it("keeps every explanation short", () => {
    const samples = [
      telegramError("CHANNEL_INVALID"),
      telegramError("CHANNEL_PRIVATE"),
      telegramError("CHAT_ADMIN_REQUIRED"),
      telegramError("AUTH_KEY_UNREGISTERED"),
      telegramError("TIMEOUT"),
      telegramError("FLOOD_WAIT_5"),
      new ApiAuthError(),
      new RateLimitError(30),
    ];

    for (const locale of [en, ru]) {
      for (const err of samples) {
        expect(localizeBotError(err, locale).length).toBeLessThan(280);
      }
    }
  });

  it("keeps the technical code for support", () => {
    expect(localizeBotError(telegramError("CHANNEL_INVALID"), en)).toContain("CHANNEL_INVALID");
  });

  it("names the wait in a flood-wait message", () => {
    expect(localizeBotError(telegramError("FLOOD_WAIT_42"), en)).toContain("42 seconds");
    expect(localizeBotError(telegramError("FLOOD_WAIT_42"), ru)).toContain("42 сек");
  });

  it("degrades to the raw text plus the admin hint for unrecognised errors", () => {
    const text = localizeBotError(new Error("brand new failure"), en);

    expect(text).toContain("brand new failure");
    expect(text).toContain(en.syncErrAdminNote);
  });

  it("does not append the admin hint when it has a specific answer", () => {
    const text = localizeBotError(telegramError("CHANNEL_PRIVATE"), en);

    expect(text).not.toContain(en.syncErrAdminNote);
  });

  it("covers every locale for every kind", () => {
    const samples = [
      telegramError("CHANNEL_INVALID"),
      telegramError("CHANNEL_PRIVATE"),
      telegramError("CHAT_ADMIN_REQUIRED"),
      telegramError("AUTH_KEY_UNREGISTERED"),
      telegramError("TIMEOUT"),
      telegramError("FLOOD_WAIT_5"),
      new ApiAuthError(),
      new RateLimitError(30),
      new ApiError("API error 400: Input validation failed (ownerId: Property is required)", 400),
      new Error("NO_ACTIVE_TG_ACCOUNT"),
      new Error("mystery"),
    ];

    for (const locale of [en, ru]) {
      for (const err of samples) {
        const text = localizeBotError(err, locale);
        expect(text.length).toBeGreaterThan(20);
        expect(text).not.toContain("undefined");
      }
    }
  });
});
