import type { Update } from "telegraf/types";

/**
 * Summarise an update for error logs without its content.
 *
 * Telegraf's default error handler prints the whole update, and users paste
 * their CRMChat API key straight into the chat — so every unhandled error on
 * that message wrote a live credential into the logs. Only identifiers go out.
 */
export function describeUpdateForLog(update: Update): string {
  const type = Object.keys(update).find((k) => k !== "update_id") ?? "unknown";
  const body = (update as unknown as Record<string, unknown>)[type] as
    | { chat?: { id?: number }; message?: { chat?: { id?: number } }; from?: { id?: number } }
    | undefined;

  const chatId = body?.chat?.id ?? body?.message?.chat?.id;
  const fromId = body?.from?.id;

  const parts = [`update_id=${update.update_id}`, `type=${type}`];
  if (chatId !== undefined) parts.push(`chat=${chatId}`);
  if (fromId !== undefined) parts.push(`from=${fromId}`);
  return parts.join(" ");
}

/** Error text for logs: stack if present, never the full object (which can carry payloads). */
export function describeErrorForLog(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  return String(err);
}
