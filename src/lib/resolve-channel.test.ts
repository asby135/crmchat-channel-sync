import { describe, it, expect, vi } from "vitest";
import { findChannelAccessHash } from "./resolve-channel.js";

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
