import { describe, it, expect, vi, beforeEach } from "vitest";
import { findChannelAccessHash, resolveAccountAndAccessHash } from "./resolve-channel.js";
import type { CrmChatClient } from "../api/client.js";

// Build a fake "messages.dialogsSlice" page where the target channel is
// absent — used to simulate the first N pages before the one we want.
function fillerPage(pageIndex: number) {
  const baseId = (pageIndex + 1) * 1000;
  const dialogs = Array.from({ length: 100 }, (_, i) => ({
    _: "dialog",
    peer: { _: "peerChannel", channelId: baseId + i },
    topMessage: baseId + i,
  }));
  const messages = dialogs.map((d) => ({
    _: "message",
    id: d.topMessage,
    date: 1_700_000_000 - d.topMessage, // strictly decreasing
  }));
  const chats = dialogs.map((d) => ({
    _: "channel",
    id: d.peer.channelId,
    accessHash: `hash_${d.peer.channelId}`,
  }));
  return {
    _: "messages.dialogsSlice",
    count: 10_000,
    dialogs,
    messages,
    chats,
    users: [],
  };
}

function pageWithTarget(targetId: number, targetHash: string) {
  return {
    _: "messages.dialogsSlice",
    count: 10_000,
    dialogs: [
      {
        _: "dialog",
        peer: { _: "peerChannel", channelId: targetId },
        topMessage: 42,
      },
    ],
    messages: [{ _: "message", id: 42, date: 1_600_000_000 }],
    chats: [{ _: "channel", id: targetId, accessHash: targetHash }],
    users: [],
  };
}

describe("findChannelAccessHash", () => {
  it("returns hash immediately when channel is on the first page", async () => {
    const callRaw = vi.fn().mockResolvedValueOnce(pageWithTarget(12345, "hX"));

    const hash = await findChannelAccessHash(callRaw, "ws", "acc", 12345);

    expect(hash).toBe("hX");
    expect(callRaw).toHaveBeenCalledTimes(1);
  });

  it("paginates and finds the channel deep in the dialog list (regression)", async () => {
    // Channels pinned-to-top bug: target channel is NOT in the first two pages,
    // only appears on the third page. The old single-page code would fail here.
    const targetId = 99999;
    const callRaw = vi
      .fn()
      .mockResolvedValueOnce(fillerPage(0))
      .mockResolvedValueOnce(fillerPage(1))
      .mockResolvedValueOnce(pageWithTarget(targetId, "deepHash"));

    const hash = await findChannelAccessHash(callRaw, "ws", "acc", targetId);

    expect(hash).toBe("deepHash");
    expect(callRaw).toHaveBeenCalledTimes(3);
    // Second and third calls must advance the offset, not reuse inputPeerEmpty.
    const secondCallParams = callRaw.mock.calls[1][3] as {
      offsetPeer: { _: string };
      offsetDate: number;
      offsetId: number;
    };
    expect(secondCallParams.offsetPeer._).toBe("inputPeerChannel");
    expect(secondCallParams.offsetDate).toBeGreaterThan(0);
    expect(secondCallParams.offsetId).toBeGreaterThan(0);
  });

  it("returns null when the channel is not in any page", async () => {
    const callRaw = vi
      .fn()
      .mockResolvedValueOnce(fillerPage(0))
      .mockResolvedValueOnce({
        _: "messages.dialogsSlice",
        count: 150,
        dialogs: [],
        messages: [],
        chats: [],
        users: [],
      });

    const hash = await findChannelAccessHash(callRaw, "ws", "acc", 42);

    expect(hash).toBeNull();
  });

  it("stops paging when server returns full list via messages.dialogs", async () => {
    const callRaw = vi.fn().mockResolvedValueOnce({
      _: "messages.dialogs", // full list, not a slice — no more pages
      dialogs: [
        {
          _: "dialog",
          peer: { _: "peerChannel", channelId: 1 },
          topMessage: 1,
        },
      ],
      messages: [{ _: "message", id: 1, date: 1 }],
      chats: [{ _: "channel", id: 1, accessHash: "h" }],
      users: [],
    });

    const hash = await findChannelAccessHash(callRaw, "ws", "acc", 999);

    expect(hash).toBeNull();
    expect(callRaw).toHaveBeenCalledTimes(1);
  });
});

// ── Account selection ─────────────────────────────────────────────────

const CHANNEL = -1001903470229; // Bot API id; MTProto id is 1903470229
const MTPROTO = 1903470229;

type Role = "absent" | "member" | "admin" | "creator" | "error";

/** One full dialogs page per account, holding the channel with the given role. */
function fakeWorkspace(accounts: Array<{ id: string; username: string; role: Role; status?: string }>) {
  const callRaw = vi.fn(async (_ws: string, accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId)!;
    if (acc.role === "error") throw new Error("API error 412: AUTH_KEY_UNREGISTERED");
    const chats =
      acc.role === "absent"
        ? []
        : [{
            _: "channel",
            id: MTPROTO,
            accessHash: `hash_${acc.id}`,
            ...(acc.role === "creator" ? { creator: true } : {}),
            ...(acc.role === "admin" ? { adminRights: { _: "chatAdminRights" } } : {}),
          }];
    return { _: "messages.dialogs", dialogs: [], messages: [], chats, users: [] };
  });
  const client = {
    listTelegramAccounts: vi.fn(async () =>
      accounts.map((a) => ({
        id: a.id,
        workspaceId: "ws",
        status: a.status ?? "active",
        telegram: { id: 1, username: a.username, phone: null },
      })),
    ),
    callTelegramRaw: callRaw,
  } as unknown as CrmChatClient;
  return { client, callRaw };
}

describe("resolveAccountAndAccessHash", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  // Regression: the first active account was the only one checked. With
  // several accounts connected, a channel owned by the third one was reported
  // as "the connected account can't see this channel".
  it("finds the channel through any connected account, not just the first", async () => {
    const { client } = fakeWorkspace([
      { id: "hints", username: "sergei_hints", role: "absent" },
      { id: "hints2", username: "sergeihints", role: "absent" },
      { id: "owner", username: "asby135", role: "creator" },
    ]);

    const resolved = await resolveAccountAndAccessHash(client, "ws", CHANNEL);

    expect(resolved).toEqual({ accountId: "owner", accessHash: "hash_owner" });
  });

  it("prefers an admin over a member account that happens to come first", async () => {
    const { client } = fakeWorkspace([
      { id: "subscriber", username: "reader", role: "member" },
      { id: "admin", username: "editor", role: "admin" },
    ]);

    const resolved = await resolveAccountAndAccessHash(client, "ws", CHANNEL);

    expect(resolved.accountId).toBe("admin");
  });

  it("stops at the first admin without scanning the rest", async () => {
    const { client, callRaw } = fakeWorkspace([
      { id: "owner", username: "asby135", role: "creator" },
      { id: "other", username: "sergei_hints", role: "absent" },
    ]);

    await resolveAccountAndAccessHash(client, "ws", CHANNEL);

    expect(callRaw.mock.calls.map((c) => c[1])).toEqual(["owner"]);
  });

  it("falls back to a member account when no admin is connected", async () => {
    const { client } = fakeWorkspace([
      { id: "a", username: "a", role: "absent" },
      { id: "subscriber", username: "reader", role: "member" },
    ]);

    const resolved = await resolveAccountAndAccessHash(client, "ws", CHANNEL);

    expect(resolved.accountId).toBe("subscriber");
  });

  it("skips an account that errors and keeps looking", async () => {
    const { client } = fakeWorkspace([
      { id: "broken", username: "sergei_crmchat", role: "error" },
      { id: "owner", username: "asby135", role: "creator" },
    ]);

    const resolved = await resolveAccountAndAccessHash(client, "ws", CHANNEL);

    expect(resolved.accountId).toBe("owner");
  });

  it("ignores accounts that aren't active", async () => {
    const { client, callRaw } = fakeWorkspace([
      { id: "banned", username: "x", role: "creator", status: "banned" },
      { id: "owner", username: "asby135", role: "creator" },
    ]);

    const resolved = await resolveAccountAndAccessHash(client, "ws", CHANNEL);

    expect(resolved.accountId).toBe("owner");
    expect(callRaw.mock.calls.map((c) => c[1])).not.toContain("banned");
  });

  it("reports the channel as not visible when no account has it", async () => {
    const { client } = fakeWorkspace([
      { id: "a", username: "a", role: "absent" },
      { id: "b", username: "b", role: "absent" },
    ]);

    await expect(resolveAccountAndAccessHash(client, "ws", CHANNEL)).rejects.toThrow(
      /Could not resolve accessHash/,
    );
  });

  it("surfaces the real error when every account failed outright", async () => {
    const { client } = fakeWorkspace([
      { id: "a", username: "a", role: "error" },
      { id: "b", username: "b", role: "error" },
    ]);

    await expect(resolveAccountAndAccessHash(client, "ws", CHANNEL)).rejects.toThrow(
      /AUTH_KEY_UNREGISTERED/,
    );
  });

  it("still reports no active account when none are connected", async () => {
    const { client } = fakeWorkspace([{ id: "a", username: "a", role: "creator", status: "offline" }]);

    await expect(resolveAccountAndAccessHash(client, "ws", CHANNEL)).rejects.toThrow(
      "NO_ACTIVE_TG_ACCOUNT",
    );
  });
});
