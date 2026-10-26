import { Markup, type Telegraf } from "telegraf";
import type { ConfigStore } from "../config/store.js";
import { CrmChatClient } from "../api/client.js";
import { bulkSync, type SearchProgress } from "../handlers/sync.js";
import { localizeBotError } from "../lib/api-errors.js";
import { formatChannelSettings, channelSettingsKeyboard } from "../handlers/settings.js";
import { findDefaultStageMapping } from "../lib/default-mapping.js";
import { buildPromotionMenu } from "../lib/promotion-menu.js";
import type { ChannelConfig, PropertyMapping } from "../config/types.js";
import { resolveAccountAndAccessHash } from "../lib/resolve-channel.js";
import { t } from "../i18n/index.js";

// ── Exported helper (testable without Telegraf context) ──────────────

export function determineMyChatMemberAction(
  oldStatus: string,
  newStatus: string,
  chatType: string,
): "promoted" | "demoted" | "ignore" {
  const validChatTypes = ["channel", "supergroup", "group"];
  if (!validChatTypes.includes(chatType)) return "ignore";

  const adminStatuses = ["administrator", "creator"];
  const removedStatuses = ["left", "kicked"];

  const wasAdmin = adminStatuses.includes(oldStatus);
  const isNowAdmin = adminStatuses.includes(newStatus);
  const isNowRemoved = removedStatuses.includes(newStatus);

  if (!wasAdmin && isNowAdmin) return "promoted";
  if (isNowRemoved) return "demoted";

  return "ignore";
}

/**
 * One line per my_chat_member event, so a stalled setup can be traced from
 * logs alone: who added or removed the bot, where, and what the bot did about
 * it. Never includes API keys or message text.
 */
export function formatMyChatMemberLog(event: {
  chatId: number;
  chatType: string;
  title: string;
  fromId: number;
  oldStatus: string;
  newStatus: string;
  result: string;
}): string {
  return (
    `[my_chat_member] chat=${event.chatId} type=${event.chatType} ` +
    `title=${JSON.stringify(event.title)} from=${event.fromId} ` +
    `${event.oldStatus}->${event.newStatus} result=${event.result}`
  );
}

// ── Listener registration ────────────────────────────────────────────

export function registerMyChatMemberListener(
  bot: Telegraf,
  config: ConfigStore,
): void {
  bot.on("my_chat_member", async (ctx) => {
    const { old_chat_member, new_chat_member, chat, from } = ctx.myChatMember;
    const oldStatus = old_chat_member.status;
    const newStatus = new_chat_member.status;
    const chatType = chat.type;

    const action = determineMyChatMemberAction(oldStatus, newStatus, chatType);

    const channelId = chat.id;
    const channelTitle = "title" in chat ? chat.title : `Chat ${channelId}`;
    const lang = from.language_code;
    const l = t(lang);

    const log = (result: string) =>
      console.log(
        formatMyChatMemberLog({
          chatId: channelId,
          chatType,
          title: channelTitle,
          fromId: from.id,
          oldStatus,
          newStatus,
          result,
        }),
      );

    if (action === "ignore") {
      log("ignored");
      return;
    }

    if (action === "promoted") {
      // Ignore events where "from" is a bot (including ourselves)
      if (from.is_bot) {
        log("ignored_from_bot");
        return;
      }

      const session = config.getSession(from.id);

      if (!session) {
        // The account that added the bot never connected a workspace. Usually
        // the customer connected from one Telegram account and added the bot
        // from another. If that account never opened the bot, the DM below
        // fails with 403 and nothing else records the attempt.
        try {
          await ctx.telegram.sendMessage(
            from.id,
            l.promotedNoSession(channelTitle),
          );
          log("no_session_dm_sent");
        } catch (err) {
          log(`no_session_dm_failed error=${JSON.stringify(String(err))}`);
        }
        return;
      }

      // Try to get workspace name and a default Lead/Closed mapping for
      // nicer onboarding (so the user doesn't have to open /settings to
      // start tracking joins/leaves on a fresh workspace).
      let workspaceName = session.workspaceId;
      let defaultMapping: PropertyMapping | undefined;
      try {
        const client = new CrmChatClient(session.apiKey);
        const [workspaces, properties] = await Promise.all([
          client.listWorkspaces(session.organizationId),
          client.listProperties(session.workspaceId).catch(() => []),
        ]);
        const ws = workspaces.find((w) => w.id === session.workspaceId);
        if (ws) workspaceName = ws.name;
        defaultMapping = findDefaultStageMapping(properties);
      } catch {
        // Fall back to workspace ID and no default mapping
      }

      // Save channel config now so /settings can find it even if user picks "Settings first"
      const channelConfig: ChannelConfig = {
        channelId,
        channelTitle,
        workspaceId: session.workspaceId,
        accountId: "",       // resolved later during sync
        accessHash: "",      // resolved later during sync
        apiKey: session.apiKey,
        propertyMapping: defaultMapping,
        addedAt: new Date().toISOString(),
      };
      config.setChannelConfig(channelId, channelConfig);
      config.incrementStat("channel_connected");
      log(`saved workspace=${session.workspaceId}`);

      const { text, extra } = buildPromotionMenu(channelConfig, workspaceName, l);
      await ctx.telegram.sendMessage(from.id, text, extra);
    }

    if (action === "demoted") {
      const wasTracked = config.getChannelConfig(channelId) !== undefined;
      config.removeChannelConfig(channelId);
      const removed = wasTracked ? "removed" : "removed_untracked";
      // Don't try to DM bots (including ourselves)
      if (from.is_bot) {
        log(removed);
        return;
      }
      try {
        await ctx.telegram.sendMessage(from.id, l.demoted(channelTitle));
        log(removed);
      } catch (err) {
        log(`${removed} dm_failed error=${JSON.stringify(String(err))}`);
      }
    }
  });

  // ── Inline keyboard callbacks ────────────────────────────────────

  bot.action(/^sync_now:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const lang = ctx.from?.language_code;
    const l = t(lang);

    const session = config.getSession(chatId);
    if (!session) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(l.syncNowSessionExpired);
      return;
    }

    // Resolve account and accessHash
    const client = new CrmChatClient(session.apiKey);
    let accountId: string;
    let accessHash: string;
    try {
      const resolved = await resolveAccountAndAccessHash(
        client,
        session.workspaceId,
        channelId,
      );
      accountId = resolved.accountId;
      accessHash = resolved.accessHash;
    } catch (err) {
      await ctx.answerCbQuery();
      // Every error now carries its own explanation and next step.
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      const text =
        errMsg === "NO_ACTIVE_TG_ACCOUNT"
          ? localizeBotError(err, l)
          : l.syncNowResolveFailed(localizeBotError(err, l));
      await ctx.editMessageText(text);
      return;
    }

    // Read title from the config saved at promotion time
    const existingConfig = config.getChannelConfig(channelId);
    const channelTitle = existingConfig?.channelTitle ?? `Channel ${channelId}`;

    config.setChannelConfig(channelId, {
      ...(existingConfig ?? {
        channelId,
        channelTitle,
        workspaceId: session.workspaceId,
        apiKey: session.apiKey,
        addedAt: new Date().toISOString(),
      }),
      channelId,
      channelTitle,
      workspaceId: session.workspaceId,
      accountId,
      accessHash,
      apiKey: session.apiKey,
    });

    await ctx.answerCbQuery();

    // Show progress message and run sync in background (avoid Telegraf timeout)
    const progressMsg = await ctx.editMessageText(
      l.syncProgressShort(channelTitle, 0, "?"),
    );

    const msgId =
      typeof progressMsg === "object" && "message_id" in progressMsg
        ? progressMsg.message_id
        : undefined;

    let lastProgressEdit = 0;
    const onProgress = async (synced: number, total: number) => {
      if (!msgId) return;
      const now = Date.now();
      if (synced < total && now - lastProgressEdit < 2000) return;
      lastProgressEdit = now;
      try {
        await ctx.telegram.editMessageText(
          chatId,
          msgId,
          undefined,
          l.syncProgressShort(channelTitle, synced, total),
        );
      } catch {
        // Ignore edit errors (message not modified, etc.)
      }
    };

    const onSearchProgress: SearchProgress = async (found, reported) => {
      if (!msgId) return;
      const now = Date.now();
      if (now - lastProgressEdit < 2000) return;
      lastProgressEdit = now;
      try {
        await ctx.telegram.editMessageText(
          chatId,
          msgId,
          undefined,
          l.syncSearching(channelTitle, found, reported ?? "?"),
        );
      } catch {
        // Ignore edit errors (message not modified, etc.)
      }
    };

    // Run sync in background to avoid Telegraf 90s callback timeout
    void (async () => {
    try {
      const result = await bulkSync({
        client,
        workspaceId: session.workspaceId,
        accountId,
        channelId,
        accessHash,
        onProgress,
        onSearchProgress,
      });

      // Update config with sync metadata
      const channelConfig = config.getChannelConfig(channelId);
      if (channelConfig) {
        config.setChannelConfig(channelId, {
          ...channelConfig,
          lastSyncAt: new Date().toISOString(),
          subscriberCount: result.total,
        });
      }

      const completionText = [
        l.syncComplete(channelTitle),
        l.syncNewContacts(result.created),
        l.syncExisting(result.existing),
        l.syncPrivate(result.private),
        l.syncFailedCount(result.failed),
        l.syncCheckCrm,
      ].join("\n");

      if (msgId) {
        await ctx.telegram.editMessageText(
          chatId,
          msgId,
          undefined,
          completionText,
        );
      }
    } catch (err) {
      console.error(`[sync_now] Error syncing channel ${channelId}:`, err);
      const errorText = l.syncFailed(channelTitle, localizeBotError(err, l));
      if (msgId) {
        try {
          await ctx.telegram.editMessageText(
            chatId,
            msgId,
            undefined,
            errorText,
          );
        } catch {
          // Ignore
        }
      }
    }
    })(); // end background sync IIFE
  });

  bot.action(/^settings_first:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    const lang = ctx.from?.language_code;
    const l = t(lang);
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText(l.settingsChannelNotFound);
      return;
    }

    await ctx.editMessageText(formatChannelSettings(ch, l), {
      ...channelSettingsKeyboard(channelId, l),
    });
  });

  bot.action(/^not_now:(-?\d+)$/, async (ctx) => {
    const lang = ctx.from?.language_code;
    const l = t(lang);
    await ctx.answerCbQuery();
    await ctx.editMessageText(l.notNowMsg);
  });
}
