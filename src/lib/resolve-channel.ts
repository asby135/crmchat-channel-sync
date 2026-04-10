import { CrmChatClient } from "../api/client.js";
import { toMtprotoChannelId } from "./telegram.js";

interface DialogChat {
  _: string;
  id: number;
  accessHash?: string;
}

interface DialogsResult {
  chats?: DialogChat[];
}

/**
 * Resolve accountId and accessHash for a channel.
 * Picks the first active Telegram account, then fetches dialogs to find the accessHash.
 */
export async function resolveAccountAndAccessHash(
  client: CrmChatClient,
  workspaceId: string,
  channelId: number,
): Promise<{ accountId: string; accessHash: string }> {
  // Pick the first active Telegram account
  const accounts = await client.listTelegramAccounts(workspaceId);
  const active = accounts.find((a) => a.status === "active");
  if (!active) {
    throw new Error("No active Telegram account found in workspace");
  }

  const accountId = active.id;
  const mtprotoId = toMtprotoChannelId(channelId);

  // Resolve accessHash via messages.getDialogs
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
    for (const chat of result.chats) {
      if (chat.id === mtprotoId && chat.accessHash) {
        return { accountId, accessHash: chat.accessHash };
      }
    }
  }

  throw new Error(`Could not resolve accessHash for channel ${channelId}`);
}
