import { Markup, type Telegraf } from "telegraf";
import { CrmChatClient, RateLimitError } from "../api/client.js";
import type { Contact, CreateContactInput } from "../api/types.js";
import type { ConfigStore } from "../config/store.js";
import type { PropertyMapping } from "../config/types.js";
import { sleep } from "../lib/rate-limiter.js";
import { resolveOwnerIdIfRequired } from "../lib/resolve-owner.js";
import { localizeBotError } from "../lib/api-errors.js";
import { toMtprotoChannelId } from "../lib/telegram.js";
import { resolveAccountAndAccessHash } from "../lib/resolve-channel.js";
import { t } from "../i18n/index.js";

// ── Active sync abort controllers ────────────────────────────────────

const activeSyncs = new Map<string, AbortController>();

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
  bot?: boolean;
}

interface ChannelParticipantsResult {
  _: string;
  count: number;
  participants: TelegramParticipant[];
  users: TelegramUser[];
}

// ── Participant fetching ──────────────────────────────────────────────

const PARTICIPANTS_PAGE = 200;

/**
 * One-letter search queries tried when the empty query doesn't return the
 * whole channel. Telegram matches them against first name, last name and
 * username, so a subscriber is reached if any of those contains the letter.
 * Names in other scripts or made only of emoji are not covered; good enough
 * per product decision.
 */
export const SEARCH_LETTERS = [
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
];

type RawCaller = Pick<CrmChatClient, "callTelegramRaw">;

/** Every page of channelParticipantsSearch for one query. */
async function searchParticipants(
  client: RawCaller,
  workspaceId: string,
  accountId: string,
  channel: Record<string, unknown>,
  q: string,
): Promise<{ participants: TelegramParticipant[]; users: TelegramUser[] }> {
  const participants: TelegramParticipant[] = [];
  const users: TelegramUser[] = [];
  let offset = 0;

  while (true) {
    const page = (await withFloodRetry(() =>
      client.callTelegramRaw(workspaceId, accountId, "channels.getParticipants", {
        channel,
        filter: { _: "channelParticipantsSearch", q },
        offset,
        limit: PARTICIPANTS_PAGE,
        hash: "0",
      }),
    )) as ChannelParticipantsResult;

    if (q === "") {
      console.log(`[bulkSync] MTProto page: type=${page._}, participants=${page.participants?.length ?? 0}`);
    }
    if (!page.participants || page.participants.length === 0) break;

    participants.push(...page.participants);
    users.push(...(page.users ?? []));

    if (page.participants.length < PARTICIPANTS_PAGE) break;
    offset += PARTICIPANTS_PAGE;
    await sleep(2000); // rate limit between MTProto calls
  }

  return { participants, users };
}

/** Subscriber count Telegram reports for the channel, or undefined if unavailable. */
async function fetchParticipantsCount(
  client: RawCaller,
  workspaceId: string,
  accountId: string,
  channel: Record<string, unknown>,
): Promise<number | undefined> {
  try {
    const full = (await withFloodRetry(() =>
      client.callTelegramRaw(workspaceId, accountId, "channels.getFullChannel", { channel }),
    )) as { fullChat?: { participantsCount?: number } };
    return full.fullChat?.participantsCount;
  } catch (err) {
    console.warn(`[bulkSync] getFullChannel failed, sweeping letters anyway:`, String(err));
    return undefined;
  }
}

/**
 * Empty query first; if that came back with only full pages and Telegram says
 * the channel has more subscribers, sweep SEARCH_LETTERS and merge by user id.
 * Small channels (a partial first page) never make an extra request.
 */
export async function fetchAllParticipants(
  client: RawCaller,
  workspaceId: string,
  accountId: string,
  channel: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ participants: TelegramParticipant[]; users: Map<number, TelegramUser> }> {
  const participants = new Map<number, TelegramParticipant>();
  const users = new Map<number, TelegramUser>();
  const add = (batch: { participants: TelegramParticipant[]; users: TelegramUser[] }) => {
    for (const u of batch.users) users.set(u.id, u);
    for (const p of batch.participants) {
      if (!participants.has(p.userId)) participants.set(p.userId, p);
    }
  };

  add(await searchParticipants(client, workspaceId, accountId, channel, ""));
  const baseline = participants.size;

  // A partial page means the empty query already returned everything.
  if (baseline === 0 || baseline % PARTICIPANTS_PAGE !== 0) {
    return { participants: [...participants.values()], users };
  }

  await sleep(2000);
  const reported = await fetchParticipantsCount(client, workspaceId, accountId, channel);
  if (reported !== undefined && reported <= baseline) {
    return { participants: [...participants.values()], users };
  }

  console.log(
    `[bulkSync] Empty query returned ${baseline} of ${reported ?? "?"}; sweeping ${SEARCH_LETTERS.length} letters`,
  );
  for (const letter of SEARCH_LETTERS) {
    if (signal?.aborted) break;
    await sleep(2000);
    const before = participants.size;
    const batch = await searchParticipants(client, workspaceId, accountId, channel, letter);
    add(batch);
    console.log(
      `[bulkSync] q="${letter}": ${batch.participants.length} found, +${participants.size - before} new, total ${participants.size}`,
    );
    if (reported !== undefined && participants.size >= reported) break;
  }
  console.log(
    `[bulkSync] Letter sweep done: ${participants.size} of ${reported ?? "?"} (empty query alone: ${baseline})`,
  );

  return { participants: [...participants.values()], users };
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
  onProgress?: (synced: number, total: number) => void | Promise<void>;
  signal?: AbortSignal;
}): Promise<SyncResult> {
  const {
    client,
    workspaceId,
    accountId,
    channelId,
    accessHash,
    signal,
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

  // 0. FETCH REQUIRED PROPERTIES: so we can set defaults on new contacts
  console.log(`[bulkSync] Starting sync for channel ${channelId}`);
  const properties = await client.listProperties(workspaceId);
  console.log(`[bulkSync] Fetched ${properties.length} properties`);
  const requiredCustomDefaults: Record<string, string> = {};
  for (const prop of properties) {
    if (prop.required && prop.key.startsWith("custom.")) {
      const shortKey = prop.key.replace(/^custom\./, "");
      // Use first option for select types, empty string for text
      const defaultVal = prop.options?.[0]?.value ?? "";
      if (defaultVal) {
        requiredCustomDefaults[shortKey] = defaultVal;
      }
    }
  }

  // Workspaces that mark Owner required reject creates that omit ownerId.
  const ownerId = await resolveOwnerIdIfRequired(client, workspaceId, properties);
  if (ownerId) {
    console.log(`[bulkSync] Workspace requires ownerId, assigning contacts to ${ownerId}`);
  }

  // 1. BATCH DEDUP: fetch all existing contacts, build Set of telegram IDs
  console.log(`[bulkSync] Fetching existing contacts for dedup...`);
  const existingContacts = await client.listContacts(workspaceId);
  console.log(`[bulkSync] Found ${existingContacts.length} existing contacts`);
  const existingTelegramIds = new Set<number>();
  const existingUsernames = new Set<string>();
  for (const contact of existingContacts) {
    if (contact.telegram?.id) {
      existingTelegramIds.add(contact.telegram.id);
    }
    if (contact.telegram?.username) {
      existingUsernames.add(contact.telegram.username.toLowerCase());
    }
  }

  // 2. FETCH SUBSCRIBERS via MTProto.
  //
  // `channelParticipantsSearch` with an empty query enumerates a megagroup
  // fully (up to ~10K), but on a broadcast channel Telegram stops at ~200, the
  // same list admins see in the "Subscribers" tab. When that happens we sweep
  // one-letter queries (a–z, а–я) and merge the results, on the hypothesis that
  // a non-empty search reaches past the visible 200. See searchParticipants.
  console.log(`[bulkSync] Fetching channel participants via MTProto...`);
  const channel = { _: "inputChannel", channelId: toMtprotoChannelId(channelId), accessHash };
  const merged = await fetchAllParticipants(client, workspaceId, accountId, channel, signal);
  const allParticipants = merged.participants;
  const userMap = merged.users;

  result.total = allParticipants.length;
  console.log(`[bulkSync] Total participants: ${result.total}, existing dedup set: ${existingTelegramIds.size}`);

  // 3. FOR EACH SUBSCRIBER: create or skip
  let processed = 0;

  for (const participant of allParticipants) {
    if (signal?.aborted) {
      console.log(`[bulkSync] Aborted by user at ${processed}/${result.total}`);
      break;
    }

    const user = userMap.get(participant.userId);

    // No user data or deleted user -> private
    if (!user || !user.id || user.deleted) {
      result.private++;
      processed++;
      if (onProgress) await onProgress(processed, result.total);
      continue;
    }

    // Skip bots
    if (user.bot) {
      result.private++;
      processed++;
      if (onProgress) await onProgress(processed, result.total);
      continue;
    }

    // Already exists in CRM — fast check from batch dedup set
    if (
      existingTelegramIds.has(user.id) ||
      (user.username && existingUsernames.has(user.username.toLowerCase()))
    ) {
      result.existing++;
      processed++;
      if (onProgress) await onProgress(processed, result.total);
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
    if (ownerId) input.ownerId = ownerId;

    // Set required custom property defaults + property mapping
    if (Object.keys(requiredCustomDefaults).length > 0 || propertyMapping) {
      input.custom = { ...requiredCustomDefaults };
      if (propertyMapping) {
        const key = propertyMapping.propertyKey.replace(/^custom\./, "");
        input.custom[key] = propertyMapping.joinValue;
      }
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
    if (onProgress) onProgress(processed, result.total);

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
    const lang = ctx.from?.language_code;
    const l = t(lang);
    const session = config.getSession(chatId);

    if (!session) {
      await ctx.reply(l.syncNeedConnect);
      return;
    }

    const channels = config.getChannelsByWorkspace(session.workspaceId);
    if (channels.length === 0) {
      // The step where a stalled setup surfaces: workspace connected, no channel saved.
      console.log(
        `[sync] No channels for chat=${chatId} workspace=${session.workspaceId}`,
      );
      await ctx.reply(l.syncNoChannels);
      return;
    }

    const buttons = channels.map((ch) =>
      Markup.button.callback(
        ch.channelTitle,
        `sync_channel:${ch.channelId}`,
      ),
    );

    await ctx.reply(l.syncPickChannel, {
      ...Markup.inlineKeyboard(buttons, { columns: 1 }),
    });
  });

  // sync_channel callback: triggered from /sync picker, sync_now, or force re-sync
  bot.action(/^(?:force_)?sync_channel:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const lang = ctx.from?.language_code;
    const l = t(lang);

    await ctx.answerCbQuery();

    const channelConfig = config.getChannelConfig(channelId);
    if (!channelConfig) {
      await ctx.editMessageText(l.syncChannelNotFound);
      return;
    }

    // Prevent accidental re-sync: offer force button instead
    if (channelConfig.lastSyncAt && !ctx.match[0].startsWith("force_sync_channel:")) {
      const alreadyText = l.syncAlreadySynced(
        channelConfig.channelTitle,
        channelConfig.subscriberCount ?? 0,
      );
      const hitBroadcastCap = channelConfig.subscriberCount === 200;
      await ctx.editMessageText(
        hitBroadcastCap ? `${alreadyText}\n${l.syncBroadcastCapNote}` : alreadyText,
        { ...Markup.inlineKeyboard([
          Markup.button.callback(l.syncForceButton, `force_sync_channel:${channelId}`),
        ]) },
      );
      return;
    }

    const client = new CrmChatClient(channelConfig.apiKey);
    const channelTitle = channelConfig.channelTitle;

    // Resolve accountId and accessHash if missing (e.g. saved at promotion time before sync_now)
    let { accountId, accessHash } = channelConfig;
    if (!accountId || !accessHash) {
      try {
        const resolved = await resolveAccountAndAccessHash(
          client,
          channelConfig.workspaceId,
          channelId,
        );
        accountId = resolved.accountId;
        accessHash = resolved.accessHash;
        // Persist so we don't have to resolve again
        config.setChannelConfig(channelId, {
          ...channelConfig,
          accountId,
          accessHash,
        });
      } catch (err) {
        await ctx.editMessageText(
          l.syncFailed(channelTitle, localizeBotError(err, l)),
        );
        return;
      }
    }

    // Abort controller for stop button
    const abortController = new AbortController();
    const stopKey = `stop_sync:${channelId}`;
    activeSyncs.set(stopKey, abortController);

    // Send initial progress message with stop button
    const stopBtn = Markup.inlineKeyboard([
      Markup.button.callback(l.syncStopBtn, stopKey),
    ]);
    const progressMsg = await ctx.editMessageText(
      l.syncProgress(channelTitle, 0, "?", buildProgressBar(0)),
      stopBtn,
    );

    // Determine message ID for editing
    const msgId =
      typeof progressMsg === "object" && "message_id" in progressMsg
        ? progressMsg.message_id
        : undefined;

    let lastProgressEdit = 0;
    const onProgress = async (synced: number, total: number) => {
      if (!msgId) return;
      // Throttle edits: update at most every 2 seconds, plus always on completion
      const now = Date.now();
      if (synced < total && now - lastProgressEdit < 2000) return;
      lastProgressEdit = now;
      const ratio = total > 0 ? synced / total : 0;
      const bar = buildProgressBar(ratio);
      try {
        await ctx.telegram.editMessageText(
          chatId,
          msgId,
          undefined,
          l.syncProgress(channelTitle, synced, total, bar),
          stopBtn,
        );
      } catch {
        // Ignore edit errors (message not modified, etc.)
      }
    };

    // Run sync in background to avoid Telegraf 90s callback timeout
    void (async () => {
    let result: SyncResult | null = null;
    let syncErr: unknown = null;
    try {
      result = await bulkSync({
        client,
        workspaceId: channelConfig.workspaceId,
        accountId,
        channelId: channelConfig.channelId,
        accessHash,
        signal: abortController.signal,
        propertyMapping: channelConfig.propertyMapping,
        onProgress,
      });

      // Update config with sync metadata
      config.setChannelConfig(channelId, {
        ...channelConfig,
        lastSyncAt: new Date().toISOString(),
        subscriberCount: result.total,
      });
      config.incrementStat("sync_completed");
    } catch (err) {
      syncErr = err;
      console.error(`[sync] Error syncing channel ${channelId}:`, err);
    }

    activeSyncs.delete(stopKey);

    // Edit the final message (isolated from sync error handling — a failed
    // final edit should not be misreported as a sync failure)
    if (!msgId) return;

    try {
      if (result) {
        const wasStopped = abortController.signal.aborted;
        // total === 200 is the tell-tale signature of hitting the Telegram
        // broadcast-channel admin-visibility cap: our pagination loop returns
        // exactly the first page and then nothing. Surface the note so the
        // user knows it's a Telegram policy limit, not a sync failure, and
        // that ongoing chat_member tracking is unaffected.
        const hitBroadcastCap = !wasStopped && result.total === 200;
        const completionText = [
          wasStopped ? l.syncStopped(channelTitle) : l.syncComplete(channelTitle),
          l.syncNewContacts(result.created),
          l.syncExisting(result.existing),
          l.syncPrivate(result.private),
          l.syncFailedCount(result.failed),
          l.syncCheckCrm,
          ...(hitBroadcastCap ? [l.syncBroadcastCapNote] : []),
        ].join("\n");
        await ctx.telegram.editMessageText(
          chatId,
          msgId,
          undefined,
          completionText,
          { reply_markup: { inline_keyboard: [] } },
        );
      } else {
        const errorText = l.syncFailed(channelTitle, localizeBotError(syncErr, l));
        await ctx.telegram.editMessageText(
          chatId,
          msgId,
          undefined,
          errorText,
          { reply_markup: { inline_keyboard: [] } },
        );
      }
    } catch (editErr) {
      console.error(`[sync] Final edit failed for channel ${channelId}:`, editErr);
    }
    })(); // end background sync IIFE
  });

  // Stop sync callback
  bot.action(/^stop_sync:(-?\d+)$/, async (ctx) => {
    const key = ctx.match[0];
    const controller = activeSyncs.get(key);
    if (controller) {
      controller.abort();
      activeSyncs.delete(key);
    }
    await ctx.answerCbQuery();
  });
}

