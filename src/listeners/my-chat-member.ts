import { Markup, type Telegraf } from "telegraf";
import type { ConfigStore } from "../config/store.js";
import { CrmChatClient } from "../api/client.js";
import { bulkSync } from "../handlers/sync.js";
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
    if (action === "ignore") return;

    const channelId = chat.id;
    const channelTitle = "title" in chat ? chat.title : `Chat ${channelId}`;
    const lang = from.language_code;
    const l = t(lang);

    if (action === "promoted") {
      // Ignore events where "from" is a bot (including ourselves)
      if (from.is_bot) return;

      const session = config.getSession(from.id);

      if (!session) {
        try {
          await ctx.telegram.sendMessage(
            from.id,
            l.promotedNoSession(channelTitle),
          );
        } catch (err) {
          console.log(`[my_chat_member] Could not DM user ${from.id}:`, String(err));
        }
        return;
      }

      // Try to get workspace name for nicer messaging
      let workspaceName = session.workspaceId;
      try {
        const client = new CrmChatClient(session.apiKey);
        const workspaces = await client.listWorkspaces(session.organizationId);
        const ws = workspaces.find((w) => w.id === session.workspaceId);
        if (ws) workspaceName = ws.name;
      } catch {
        // Fall back to workspace ID
      }

      // Save channel config now so /settings can find it even if user picks "Settings first"
      config.setChannelConfig(channelId, {
        channelId,
        channelTitle,
        workspaceId: session.workspaceId,
        accountId: "",       // resolved later during sync
        accessHash: "",      // resolved later during sync
        apiKey: session.apiKey,
        addedAt: new Date().toISOString(),
      });

      await ctx.telegram.sendMessage(
        from.id,
        l.promotedWithSession(channelTitle, workspaceName),
        {
          ...Markup.inlineKeyboard([
            Markup.button.callback(l.syncNowBtn, `sync_now:${channelId}`),
            Markup.button.callback(
              l.settingsFirstBtn,
              `settings_first:${channelId}`,
            ),
            Markup.button.callback(l.notNowBtn, `not_now:${channelId}`),
          ]),
        },
      );
    }

    if (action === "demoted") {
      config.removeChannelConfig(channelId);
      // Don't try to DM bots (including ourselves)
      if (!from.is_bot) {
        try {
          await ctx.telegram.sendMessage(
            from.id,
            l.demoted(channelTitle),
          );
        } catch (err) {
          console.log(`[my_chat_member] Could not DM user ${from.id}:`, String(err));
        }
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
      await ctx.editMessageText(
        l.syncNowResolveFailed(err instanceof Error ? err.message : "Unknown error"),
      );
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
      const errorText = l.syncFailed(channelTitle, err instanceof Error ? err.message : "Unknown error");
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
    const lang = ctx.from?.language_code;
    const l = t(lang);
    await ctx.answerCbQuery();
    await ctx.editMessageText(l.settingsFirstMsg);
  });

  bot.action(/^not_now:(-?\d+)$/, async (ctx) => {
    const lang = ctx.from?.language_code;
    const l = t(lang);
    await ctx.answerCbQuery();
    await ctx.editMessageText(l.notNowMsg);
  });
}
