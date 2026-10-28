import { CrmChatClient } from "../api/client.js";
import { toMtprotoChannelId } from "./telegram.js";

// Minimal MTProto shapes we care about. The CRMChat telegramRaw endpoint
// returns raw MTProto objects with a `_` type tag.

interface DialogChat {
  _: string;
  id: number | string;
  accessHash?: string;
  /** Set when the account calling getDialogs created the channel. */
  creator?: boolean;
  /** Present when the account calling getDialogs is an admin of the channel. */
  adminRights?: unknown;
}

interface DialogUser {
  _: string;
  id: number | string;
  accessHash?: string;
}

interface Peer {
  _: string; // "peerChannel" | "peerChat" | "peerUser"
  channelId?: number | string;
  chatId?: number | string;
  userId?: number | string;
}

interface Dialog {
  _: string;
  peer: Peer;
  topMessage: number;
}

interface DialogMessage {
  _: string;
  id?: number;
  date?: number;
}

interface DialogsResult {
  _: string; // "messages.dialogs" | "messages.dialogsSlice" | "messages.dialogsNotModified"
  dialogs?: Dialog[];
  messages?: DialogMessage[];
  chats?: DialogChat[];
  users?: DialogUser[];
  count?: number;
}

// Safety cap: 20 pages × 100 dialogs = 2000 dialogs scanned. Enough for any
// realistic user while preventing runaway loops on a buggy MTProto response.
const MAX_DIALOG_PAGES = 20;
const PAGE_LIMIT = 100;

type RawCaller = (
  workspaceId: string,
  accountId: string,
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Walk the user's dialog list and return the accessHash for the target
 * channel, or null if it's not in the first MAX_DIALOG_PAGES × PAGE_LIMIT
 * dialogs. Exported for testing.
 */
export async function findChannelAccessHash(
  callRaw: RawCaller,
  workspaceId: string,
  accountId: string,
  mtprotoChannelId: number,
): Promise<string | null> {
  const found = await findChannelInDialogs(callRaw, workspaceId, accountId, mtprotoChannelId);
  return found?.accessHash ?? null;
}

/**
 * Walk the account's dialog list for the target channel. Returns its access
 * hash and whether this account is the channel's creator or an admin, which is
 * what Telegram requires to list subscribers.
 */
export async function findChannelInDialogs(
  callRaw: RawCaller,
  workspaceId: string,
  accountId: string,
  mtprotoChannelId: number,
): Promise<{ accessHash: string; isAdmin: boolean } | null> {
  let offsetDate = 0;
  let offsetId = 0;
  let offsetPeer: Record<string, unknown> = { _: "inputPeerEmpty" };

  for (let page = 0; page < MAX_DIALOG_PAGES; page++) {
    const raw = await callRaw(
      workspaceId,
      accountId,
      "messages.getDialogs",
      {
        offsetDate,
        offsetId,
        offsetPeer,
        limit: PAGE_LIMIT,
        hash: "0",
      },
    );

    const result = raw as DialogsResult;

    // Scan this page for the target channel.
    for (const chat of result.chats ?? []) {
      if (Number(chat.id) === mtprotoChannelId && chat.accessHash) {
        return { accessHash: chat.accessHash, isAdmin: Boolean(chat.creator || chat.adminRights) };
      }
    }

    // Decide whether to keep paging.
    const dialogs = result.dialogs ?? [];
    if (dialogs.length === 0) return null;
    // "messages.dialogs" (no "Slice") means the server returned the entire
    // list in one shot — no more pages to fetch.
    if (result._ === "messages.dialogs") return null;
    // Short page = last page.
    if (dialogs.length < PAGE_LIMIT) return null;

    // Compute the offsets for the next page from the last dialog on this page.
    const lastDialog = dialogs[dialogs.length - 1];
    const topMessageId = lastDialog.topMessage;
    const lastMessage = (result.messages ?? []).find(
      (m) => m.id === topMessageId,
    );
    if (!lastMessage?.date || lastMessage.id == null) return null;

    offsetDate = lastMessage.date;
    offsetId = lastMessage.id;

    const peer = lastDialog.peer;
    if (peer._ === "peerChannel") {
      const chat = (result.chats ?? []).find(
        (c) => String(c.id) === String(peer.channelId),
      );
      if (!chat?.accessHash) return null;
      offsetPeer = {
        _: "inputPeerChannel",
        channelId: peer.channelId,
        accessHash: chat.accessHash,
      };
    } else if (peer._ === "peerChat") {
      offsetPeer = { _: "inputPeerChat", chatId: peer.chatId };
    } else if (peer._ === "peerUser") {
      const user = (result.users ?? []).find(
        (u) => String(u.id) === String(peer.userId),
      );
      if (!user?.accessHash) return null;
      offsetPeer = {
        _: "inputPeerUser",
        userId: peer.userId,
        accessHash: user.accessHash,
      };
    } else {
      return null;
    }
  }

  return null;
}

/**
 * Resolve accountId and accessHash for a channel.
 *
 * A workspace can have several Telegram accounts connected, and only some of
 * them are in a given channel. Checks every active account and prefers one that
 * owns or administers the channel, since Telegram only lists subscribers to
 * admins. A member-only account is the fallback, so the sync can at least
 * report "not an admin" instead of "can't see the channel". An account that
 * errors (disconnected, restricted) is skipped rather than ending the search.
 */
export async function resolveAccountAndAccessHash(
  client: CrmChatClient,
  workspaceId: string,
  channelId: number,
): Promise<{ accountId: string; accessHash: string }> {
  const accounts = (await client.listTelegramAccounts(workspaceId)).filter(
    (a) => a.status === "active",
  );
  if (accounts.length === 0) {
    console.log(`[resolve_channel] channel=${channelId} workspace=${workspaceId} no active accounts`);
    throw new Error("NO_ACTIVE_TG_ACCOUNT");
  }

  const mtprotoId = toMtprotoChannelId(channelId);
  const callRaw: RawCaller = (ws, acc, method, params) =>
    client.callTelegramRaw(ws, acc, method, params);

  let memberOnly: { accountId: string; accessHash: string } | null = null;
  let lastError: unknown = null;
  let checked = 0;

  for (const account of accounts) {
    const label = account.telegram.username ? `@${account.telegram.username}` : account.id;
    let found: Awaited<ReturnType<typeof findChannelInDialogs>>;
    try {
      found = await findChannelInDialogs(callRaw, workspaceId, account.id, mtprotoId);
    } catch (err) {
      lastError = err;
      console.log(
        `[resolve_channel] channel=${channelId} account=${label} error=${JSON.stringify(String(err))}`,
      );
      continue;
    }
    checked++;

    if (!found) {
      console.log(`[resolve_channel] channel=${channelId} account=${label} not in chats`);
      continue;
    }
    if (found.isAdmin) {
      console.log(`[resolve_channel] channel=${channelId} account=${label} admin, using it`);
      return { accountId: account.id, accessHash: found.accessHash };
    }
    console.log(`[resolve_channel] channel=${channelId} account=${label} member, not admin`);
    memberOnly ??= { accountId: account.id, accessHash: found.accessHash };
  }

  if (memberOnly) return memberOnly;

  // Every account failed outright: surface the real reason (e.g. a disconnected
  // account) rather than claiming none of them can see the channel.
  if (checked === 0 && lastError) throw lastError;

  console.log(
    `[resolve_channel] channel=${channelId} not found in any of ${accounts.length} active accounts`,
  );
  throw new Error(`Could not resolve accessHash for channel ${channelId}`);
}
