import { ApiAuthError, ApiError, RateLimitError } from "../api/client.js";
import type { t } from "../i18n/index.js";

/**
 * Failures worth explaining differently, because the fix differs.
 *
 * Telegram RPC errors reach us as HTTP 400 with the raw MTProto text in the
 * message (see extractErrorDetail in api/client.ts). Matching on that text is
 * the only way to tell "you're not in the channel" from "you're in it but not
 * an admin" — two problems with very different remedies.
 */
export type BotError =
  | { kind: "noActiveAccount" }
  | { kind: "channelNotVisible" }
  | { kind: "channelPrivate" }
  | { kind: "adminRequired" }
  | { kind: "accountDisconnected" }
  | { kind: "telegramUnavailable" }
  | { kind: "floodWait"; seconds: number }
  | { kind: "apiKeyInvalid" }
  | { kind: "rateLimited"; seconds: number }
  | { kind: "ownerRequired" }
  | { kind: "unknown"; detail: string };

/** Technical code kept alongside the explanation so support can still diagnose. */
export function technicalCode(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const match = err.message.match(
    /\b(FLOOD_WAIT_\d+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/,
  );
  return match?.[1];
}

export function classifyBotError(err: unknown): BotError {
  if (err instanceof ApiAuthError) return { kind: "apiKeyInvalid" };
  if (err instanceof RateLimitError) {
    return { kind: "rateLimited", seconds: err.retryAfter };
  }

  const message = err instanceof Error ? err.message : String(err);

  if (message === "NO_ACTIVE_TG_ACCOUNT") return { kind: "noActiveAccount" };
  if (message.startsWith("Could not resolve accessHash")) {
    return { kind: "channelNotVisible" };
  }

  const flood = message.match(/FLOOD_WAIT_(\d+)/);
  if (flood) return { kind: "floodWait", seconds: Number(flood[1]) };

  // Specific Telegram codes before any status-based fallback.
  if (message.includes("CHAT_ADMIN_REQUIRED")) return { kind: "adminRequired" };
  if (message.includes("CHANNEL_PRIVATE")) return { kind: "channelPrivate" };
  if (message.includes("CHANNEL_INVALID") || message.includes("PEER_ID_INVALID")) {
    return { kind: "channelNotVisible" };
  }
  if (
    message.includes("AUTH_KEY_UNREGISTERED") ||
    message.includes("USER_DEACTIVATED") ||
    message.includes("SESSION_REVOKED") ||
    message.includes("not connected")
  ) {
    return { kind: "accountDisconnected" };
  }
  if (message.includes("ownerId") && message.includes("Property is required")) {
    return { kind: "ownerRequired" };
  }
  if (message.includes("TIMEOUT")) return { kind: "telegramUnavailable" };
  if (err instanceof ApiError && (err.status === 503 || err.status === 502)) {
    return { kind: "telegramUnavailable" };
  }

  return { kind: "unknown", detail: message };
}

/**
 * Turn any failure into something a channel owner can act on. Falls back to the
 * raw text plus the admin hint when we genuinely don't recognise the error, so
 * a new Telegram error code degrades to today's behaviour instead of a lie.
 */
export function localizeBotError(err: unknown, l: ReturnType<typeof t>): string {
  const classified = classifyBotError(err);

  switch (classified.kind) {
    case "noActiveAccount":
      return l.syncErrNoActiveTgAccount;
    case "channelNotVisible":
      return withCode(l.errChannelNotVisible, err, l);
    case "channelPrivate":
      return withCode(l.errChannelPrivate, err, l);
    case "adminRequired":
      return withCode(l.errAdminRequired, err, l);
    case "accountDisconnected":
      return withCode(l.errAccountDisconnected, err, l);
    case "telegramUnavailable":
      return withCode(l.errTelegramUnavailable, err, l);
    case "floodWait":
      return withCode(l.errFloodWait(classified.seconds), err, l);
    case "apiKeyInvalid":
      return l.errApiKeyInvalid;
    case "rateLimited":
      return l.errRateLimited(classified.seconds);
    case "ownerRequired":
      return withCode(l.errOwnerRequired, err, l);
    case "unknown":
      return `${classified.detail}\n\n${l.syncErrAdminNote}`;
  }
}

function withCode(text: string, err: unknown, l: ReturnType<typeof t>): string {
  const code = technicalCode(err);
  return code ? `${text}\n\n${l.errTechnicalCode(code)}` : text;
}
