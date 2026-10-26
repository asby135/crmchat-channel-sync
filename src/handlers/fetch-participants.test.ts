import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/rate-limiter.js", () => ({
  sleep: () => Promise.resolve(),
}));

import { fetchAllParticipants, SEARCH_LETTERS } from "./sync.js";
import type { CrmChatClient } from "../api/client.js";

// ── Fake Telegram ────────────────────────────────────────────────────

type FakeUser = { id: number; firstName: string };

const CAP = 200;

/**
 * Models a broadcast channel as the hypothesis describes it: the empty query
 * shows only the first 200 subscribers, while a non-empty query searches the
 * whole base (each query itself capped at 200, like Telegram's other limits).
 */
function fakeChannel(users: FakeUser[], opts: { fullChannelFails?: boolean } = {}) {
  const calls: Array<{ method: string; q?: string; offset?: number }> = [];

  const callTelegramRaw = vi.fn(
    async (_ws: string, _acc: string, method: string, params: Record<string, unknown>) => {
      if (method === "channels.getFullChannel") {
        calls.push({ method });
        if (opts.fullChannelFails) throw new Error("API error 400: CHANNEL_PRIVATE");
        return { fullChat: { participantsCount: users.length } };
      }

      const q = (params.filter as { q: string }).q;
      const offset = params.offset as number;
      const limit = params.limit as number;
      calls.push({ method, q, offset });

      const pool =
        q === ""
          ? users.slice(0, CAP)
          : users.filter((u) => u.firstName.toLowerCase().includes(q)).slice(0, CAP);
      const page = pool.slice(offset, offset + limit);
      return {
        _: "channels.channelParticipants",
        count: pool.length,
        participants: page.map((u) => ({ _: "channelParticipant", userId: u.id })),
        users: page.map((u) => ({ _: "user", id: u.id, firstName: u.firstName })),
      };
    },
  );

  return { client: { callTelegramRaw } as unknown as CrmChatClient, calls };
}

/** n users whose names start with letters spread across both alphabets. */
function makeUsers(n: number): FakeUser[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + i,
    firstName: `${SEARCH_LETTERS[i % SEARCH_LETTERS.length]}user${i}`,
  }));
}

const channel = { _: "inputChannel", channelId: 1, accessHash: "h" };

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("fetchAllParticipants", () => {
  it("makes one request for a small channel and never sweeps", async () => {
    const { client, calls } = fakeChannel(makeUsers(37));

    const result = await fetchAllParticipants(client, "ws", "acc", channel);

    expect(result.participants).toHaveLength(37);
    expect(calls).toEqual([{ method: "channels.getParticipants", q: "", offset: 0 }]);
  });

  it("sweeps letters when the empty query stops at 200 and the channel is bigger", async () => {
    const { client, calls } = fakeChannel(makeUsers(2000));

    const result = await fetchAllParticipants(client, "ws", "acc", channel);

    // The empty query alone would have returned 200.
    expect(result.participants.length).toBeGreaterThan(200);
    expect(calls.some((c) => c.method === "channels.getFullChannel")).toBe(true);
    expect(calls.some((c) => c.q === "a")).toBe(true);
    expect(calls.some((c) => c.q === "я")).toBe(true);
  });

  it("dedupes subscribers found by several letters", async () => {
    const { client } = fakeChannel(makeUsers(2000));

    const result = await fetchAllParticipants(client, "ws", "acc", channel);
    const ids = result.participants.map((p) => p.userId);

    expect(new Set(ids).size).toBe(ids.length);
    // Every participant has a matching user record for contact creation.
    for (const id of ids) expect(result.users.get(id)).toBeDefined();
  });

  it("does not sweep when 200 is the real size of the channel", async () => {
    const { client, calls } = fakeChannel(makeUsers(200));

    const result = await fetchAllParticipants(client, "ws", "acc", channel);

    expect(result.participants).toHaveLength(200);
    expect(calls.filter((c) => c.q && c.q !== "")).toHaveLength(0);
  });

  it("still sweeps when getFullChannel fails", async () => {
    const { client, calls } = fakeChannel(makeUsers(800), { fullChannelFails: true });

    const result = await fetchAllParticipants(client, "ws", "acc", channel);

    expect(result.participants.length).toBeGreaterThan(200);
    // Every letter is tried (some need a second page, so count letters, not calls).
    const letters = new Set(calls.filter((c) => c.q).map((c) => c.q));
    expect(letters.size).toBe(SEARCH_LETTERS.length);
  });

  it("stops sweeping once every reported subscriber is found", async () => {
    // 260 users: only "a"–"e" names beyond the first 200, all found early.
    const users = makeUsers(200).concat(
      Array.from({ length: 60 }, (_, i) => ({ id: 9000 + i, firstName: `aextra${i}` })),
    );
    const { client, calls } = fakeChannel(users);

    const result = await fetchAllParticipants(client, "ws", "acc", channel);

    expect(result.participants).toHaveLength(260);
    expect(calls.filter((c) => c.q && c.q !== "").length).toBeLessThan(SEARCH_LETTERS.length);
  });

  it("stops the sweep when the user presses Stop", async () => {
    const controller = new AbortController();
    const { client, calls } = fakeChannel(makeUsers(2000));
    const original = client.callTelegramRaw;
    let letterQueries = 0;
    (client as { callTelegramRaw: typeof original }).callTelegramRaw = (async (...args) => {
      const params = args[3] as { filter?: { q?: string } };
      if (params.filter?.q) {
        letterQueries++;
        if (letterQueries === 3) controller.abort();
      }
      return original(...args);
    }) as typeof original;

    await fetchAllParticipants(client, "ws", "acc", channel, controller.signal);

    expect(calls.filter((c) => c.q && c.q !== "")).toHaveLength(3);
  });
});
