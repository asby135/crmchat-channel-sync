import { Markup, type Telegraf } from "telegraf";
import type { ConfigStore } from "../config/store.js";
import { CrmChatClient } from "../api/client.js";
import { bulkSync } from "../handlers/sync.js";

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

// ── Access hash resolution ──────────────────────────────────────────

interface DialogChat {
  _: string;
  id: number;
  accessHash?: string;
}

interface DialogsResult {
  chats?: DialogChat[];
}

/**
 * Resolve the MTProto accessHash for a channel by fetching recent dialogs
 * and finding the matching channel by ID.
 */
/**
 * Convert Bot API channel/supergroup ID to MTProto channel ID.
 * Bot API adds -100 prefix to channel IDs: -100{channelId}
 */
export function toMtprotoChannelId(botApiId: number): number {
  const s = String(botApiId);
  if (s.startsWith("-100")) {
    return Number(s.slice(4));
  }
  // Already a positive MTProto ID or a regular group ID
  return Math.abs(botApiId);
}

async function resolveAccessHash(
  client: CrmChatClient,
  workspaceId: string,
  accountId: string,
  channelId: number,
): Promise<string> {
  const mtprotoId = toMtprotoChannelId(channelId);
  console.log(`[resolveAccessHash] Bot API ID: ${channelId}, MTProto ID: ${mtprotoId}`);

  const raw = await client.callTelegramRaw(
    workspaceId,
    accountId,
    "messages.getDialogs",
    {
      offsetDate: 0,
      offsetId: 0,
      offsetPeer: { _: "inputPeerEmpty" },
      limit: 100,
      hash: "0",
    },
  );

  const result = raw as DialogsResult;
  if (result.chats) {
    console.log(`[resolveAccessHash] Got ${result.chats.length} chats, looking for ID ${mtprotoId}`);
    for (const chat of result.chats) {
      if (chat.id === mtprotoId && chat.accessHash) {
        console.log(`[resolveAccessHash] Found! accessHash: ${chat.accessHash}`);
        return chat.accessHash;
      }
    }
    // Log what IDs we got for debugging
    const chatIds = result.chats.map(c => `${c.id}(${c._})`).join(", ");
    console.log(`[resolveAccessHash] Channel not found. Chat IDs: ${chatIds}`);
  }

  return "";
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

    if (action === "promoted") {
      // Ignore events where "from" is a bot (including ourselves)
      if (from.is_bot) return;

      const session = config.getSession(from.id);

      if (!session) {
        try {
          await ctx.telegram.sendMessage(
            from.id,
            `I've been added to ${channelTitle}! To sync subscribers, first connect your CRMChat account: send /start to me in DM.`,
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
        `I've been added to **${channelTitle}**! Want to sync its subscribers to your CRMChat workspace (${workspaceName})?`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            Markup.button.callback("\u2705 Sync now", `sync_now:${channelId}`),
            Markup.button.callback(
              "\u2699\ufe0f Settings first",
              `settings_first:${channelId}`,
            ),
            Markup.button.callback("\u274c Not now", `not_now:${channelId}`),
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
            `I've been removed from ${channelTitle}. Sync stopped.`,
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

    const session = config.getSession(chatId);
    if (!session) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        "Session expired. Please reconnect with /start first.",
      );
      return;
    }

    // Pick the first active Telegram account from the workspace
    let accountId = "";
    const client = new CrmChatClient(session.apiKey);
    try {
      const accounts = await client.listTelegramAccounts(session.workspaceId);
      const active = accounts.find((a) => a.status === "active");
      if (active) accountId = active.id;
    } catch {
      // Leave as empty string; will fail below
    }

    if (!accountId) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        "No active Telegram account found in your workspace. Please add one in CRMChat first.",
      );
      return;
    }

    // Resolve the channel's accessHash via messages.getDialogs
    let accessHash = "";
    try {
      accessHash = await resolveAccessHash(
        client,
        session.workspaceId,
        accountId,
        channelId,
      );
    } catch (err) {
      console.error(
        `[sync_now] Failed to resolve accessHash for channel ${channelId}:`,
        err,
      );
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

    // Show progress message and directly trigger sync
    const progressMsg = await ctx.editMessageText(
      `Syncing ${channelTitle}...\n0/? subscribers`,
    );

    const msgId =
      typeof progressMsg === "object" && "message_id" in progressMsg
        ? progressMsg.message_id
        : undefined;

    const onProgress = async (synced: number, total: number) => {
      if (!msgId) return;
      try {
        await ctx.telegram.editMessageText(
          chatId,
          msgId,
          undefined,
          `Syncing ${channelTitle}...\n${synced}/${total} subscribers`,
        );
      } catch {
        // Ignore edit errors (message not modified, etc.)
      }
    };

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
        `Sync complete for ${channelTitle}!`,
        `${result.created} new contacts`,
        `${result.existing} already existed`,
        `${result.private} private (skipped)`,
        `${result.failed} failed`,
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
      const errorText = `Sync failed for ${channelTitle}. ${err instanceof Error ? err.message : "Unknown error"}`;
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
  });

  bot.action(/^settings_first:(-?\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      "Use /settings to configure property mappings, then come back.",
    );
  });

  bot.action(/^not_now:(-?\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      "No problem! You can sync anytime with /sync.",
    );
  });
}
