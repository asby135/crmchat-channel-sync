import { Markup } from "telegraf";
import type { ChannelConfig } from "../config/types.js";
import type { Locale } from "../i18n/index.js";

/**
 * Build the "I've been added to <channel>" promotion prompt for a single
 * channel — same shape used when the bot is first promoted to admin and
 * when the user opens the Main menu later. Centralised here so the per-
 * channel `main_menu:<id>` callback and the global `main_menu_global`
 * callback render identically.
 */
export function buildPromotionMenu(
  ch: ChannelConfig,
  workspaceName: string,
  l: Locale,
): { text: string; extra: object } {
  const mapping = ch.propertyMapping;
  const text = l.promotedWithSession(
    ch.channelTitle,
    workspaceName,
    mapping
      ? {
          joinLabel: mapping.joinLabel,
          leaveLabel: mapping.leaveLabel,
          propertyName: mapping.propertyName,
        }
      : undefined,
  );
  const extra = {
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(l.syncNowBtn, `sync_now:${ch.channelId}`),
        Markup.button.callback(l.settingsFirstBtn, `settings_first:${ch.channelId}`),
        Markup.button.callback(l.notNowBtn, `not_now:${ch.channelId}`),
      ],
      [Markup.button.callback(l.switchWorkspaceBtn, "switch_workspace")],
    ]),
  };
  return { text, extra };
}
