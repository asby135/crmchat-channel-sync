import { Markup, type Telegraf } from "telegraf";
import { CrmChatClient, RateLimitError } from "../api/client.js";
import type { Contact, CreateContactInput } from "../api/types.js";
import type { ConfigStore } from "../config/store.js";
import type { PropertyMapping } from "../config/types.js";
import { sleep } from "../lib/rate-limiter.js";

// ── Flood / rate-limit retry helpers ─────────────────────────────────

const MAX_RETRIES = 3;

function extractFloodWaitSeconds(err: unknown): number | null {
  if (err instanceof RateLimitError) return err.retryAfter;
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/FLOOD_WAIT_(\d+)/);
  if (match) return Number(match[1]);
  if (msg.includes("FLOOD_WAIT")) return 30; // fallback
  return null;
}

async function withFloodRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const waitSec = extractFloodWaitSeconds(err);
      if (waitSec !== null && attempt < MAX_RETRIES - 1) {
        console.warn(
          `[withFloodRetry] Flood wait ${waitSec}s, retrying (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await sleep(waitSec * 1000);
        continue;
      }
      throw err;
    }
  }
  // Unreachable but satisfies TS
  throw new Error("withFloodRetry: exhausted retries");
}

// ── Types ─────────────────────────────────────────────────────────────

export interface SyncResult {
  created: number;
  existing: number;
  private: number;
  failed: number;
  total: number;
}

interface TelegramParticipant {
  _: string;
  userId: number;
  date?: number;
}

interface TelegramUser {
  _: string;
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  deleted?: boolean;
}

interface ChannelParticipantsResult {
  _: string;
  count: number;
  participants: TelegramParticipant[];
  users: TelegramUser[];
}

// ── Pure helpers ──────────────────────────────────────────────────────

export function buildFullName(
  firstName?: string,
  lastName?: string,
  telegramId?: number,
): string {
  const first = firstName?.trim() ?? "";
  const last = lastName?.trim() ?? "";

  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return `User ${telegramId ?? 0}`;
}

function buildProgressBar(ratio: number, width = 8): string {
  const filled = Math.round(ratio * width);
  return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
}

// ── Core sync function ────────────────────────────────────────────────

export async function bulkSync(options: {
  client: CrmChatClient;
  workspaceId: string;
  accountId: string;
  channelId: number;
  accessHash: string;
  propertyMapping?: PropertyMapping;
  onProgress?: (synced: number, total: number) => void;
}): Promise<SyncResult> {
  const {
    client,
    workspaceId,
    accountId,
    channelId,
    accessHash,
    propertyMapping,
    onProgress,
  } = options;

  const result: SyncResult = {
    created: 0,
    existing: 0,
    private: 0,
    failed: 0,
    total: 0,
  };

  // 1. BATCH DEDUP: fetch all existing contacts, build Set of telegram IDs
  const existingContacts = await client.listContacts(workspaceId);
  const existingTelegramIds = new Set<number>();
  for (const contact of existingContacts) {
    if (contact.telegram?.id) {
      existingTelegramIds.add(contact.telegram.id);
    }
  }

  // 2. FETCH SUBSCRIBERS via MTProto pagination
  const allParticipants: TelegramParticipant[] = [];
  const allUsers: TelegramUser[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const raw = await withFloodRetry(() =>
      client.callTelegramRaw(
        workspaceId,
        accountId,
        "channels.getParticipants",
        {
          channel: { _: "inputChannel", channel_id: channelId, access_hash: accessHash },
          filter: { _: "channelParticipantsRecent" },
          offset,
          limit,
          hash: 0,
        },
      ),
    );

    const page = raw as ChannelParticipantsResult;

    if (!page.participants || page.participants.length === 0) break;

    allParticipants.push(...page.participants);
    allUsers.push(...page.users);

    if (page.participants.length < limit) break;

    offset += limit;
    await sleep(2000); // rate limit between MTProto calls
  }

  // Build user lookup map
  const userMap = new Map<number, TelegramUser>();
  for (const user of allUsers) {
    userMap.set(user.id, user);
  }

  result.total = allParticipants.length;

  // 3. FOR EACH SUBSCRIBER: create or skip
  let processed = 0;

  for (const participant of allParticipants) {
    const user = userMap.get(participant.userId);

    // No user data or deleted user -> private
    if (!user || !user.id || user.deleted) {
      result.private++;
      processed++;
      continue;
    }

    // Already exists in CRM
    if (existingTelegramIds.has(user.id)) {
      result.existing++;
      processed++;
      continue;
    }

    // Build contact input
    const fullName = buildFullName(user.firstName, user.lastName, user.id);
    const input: CreateContactInput = {
      fullName,
      telegram: {
        id: user.id,
        username: user.username || undefined,
      },
    };

    // Apply property mapping if configured
    if (propertyMapping) {
      const key = propertyMapping.propertyKey.replace(/^custom\./, "");
      input.custom = { [key]: propertyMapping.joinValue };
    }

    try {
      await withFloodRetry(() => client.createContact(workspaceId, input));
      result.created++;
      // Add to set to prevent duplicates within the same batch
      existingTelegramIds.add(user.id);
    } catch (err) {
      result.failed++;
      console.error(
        `[bulkSync] Failed to create contact for user ${user.id}:`,
        err,
      );
    }

    processed++;

    // Fire progress callback every 200 subscribers (or on last)
    if (onProgress && (processed % 200 === 0 || processed === result.total)) {
      onProgress(processed, result.total);
    }

    // Rate limit between CRM API create calls
    await sleep(100);
  }

  return result;
}

// ── Bot handler registration ──────────────────────────────────────────

export function registerSyncHandler(bot: Telegraf, config: ConfigStore): void {
  // /sync command: list configured channels for the user to pick
  bot.command("sync", async (ctx) => {
    const chatId = ctx.chat.id;
    const session = config.getSession(chatId);

    if (!session) {
      await ctx.reply(
        "You need to connect first. Send /start to set up your CRMChat API key.",
      );
      return;
    }

    const channels = config.getChannelsByWorkspace(session.workspaceId);
    if (channels.length === 0) {
      await ctx.reply(
        "No channels configured yet. Add me as admin to a channel or group first.",
      );
      return;
    }

    const buttons = channels.map((ch) =>
      Markup.button.callback(
        ch.channelTitle,
        `sync_channel:${ch.channelId}`,
      ),
    );

    await ctx.reply("Pick a channel to sync:", {
      ...Markup.inlineKeyboard(buttons, { columns: 1 }),
    });
  });

  // sync_channel callback: triggered from /sync picker or sync_now flow
  bot.action(/^sync_channel:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    await ctx.answerCbQuery();

    const channelConfig = config.getChannelConfig(channelId);
    if (!channelConfig) {
      await ctx.editMessageText("Channel not found in config. Try /sync again.");
      return;
    }

    const client = new CrmChatClient(channelConfig.apiKey);
    const channelTitle = channelConfig.channelTitle;

    // Send initial progress message
    const progressMsg = await ctx.editMessageText(
      `Syncing ${channelTitle}...\n0/? subscribers synced ${buildProgressBar(0)}`,
    );

    // Determine message ID for editing
    const msgId =
      typeof progressMsg === "object" && "message_id" in progressMsg
        ? progressMsg.message_id
        : undefined;

    const onProgress = async (synced: number, total: number) => {
      if (!msgId) return;
      const ratio = total > 0 ? synced / total : 0;
      const bar = buildProgressBar(ratio);
      try {
        await ctx.telegram.editMessageText(
          chatId,
          msgId,
          undefined,
          `Syncing ${channelTitle}...\n${synced}/${total} subscribers synced ${bar}`,
        );
      } catch {
        // Ignore edit errors (message not modified, etc.)
      }
    };

    try {
      const result = await bulkSync({
        client,
        workspaceId: channelConfig.workspaceId,
        accountId: channelConfig.accountId,
        channelId: channelConfig.channelId,
        accessHash: channelConfig.accessHash,
        propertyMapping: channelConfig.propertyMapping,
        onProgress,
      });

      // Update config with sync metadata
      config.setChannelConfig(channelId, {
        ...channelConfig,
        lastSyncAt: new Date().toISOString(),
        subscriberCount: result.total,
      });

      // Final completion message
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
      console.error(`[sync] Error syncing channel ${channelId}:`, err);
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
}
