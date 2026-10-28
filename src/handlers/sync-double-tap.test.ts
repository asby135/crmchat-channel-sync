import { describe, it, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Telegraf } from "telegraf";

vi.mock("../lib/rate-limiter.js", () => ({
  sleep: () => Promise.resolve(),
}));

// The access-hash lookup pages through the account's chats and can take
// seconds in production. Tests hold it open to land a second tap inside it.
vi.mock("../lib/resolve-channel.js", () => ({
  resolveAccountAndAccessHash: vi.fn(),
}));

import { registerSyncHandler, claimSync, releaseSync, stopSync } from "./sync.js";
import { registerMyChatMemberListener } from "../listeners/my-chat-member.js";
import { resolveAccountAndAccessHash } from "../lib/resolve-channel.js";
import { ConfigStore } from "../config/store.js";
import { t } from "../i18n/index.js";

const CHANNEL_ID = -1001402968895;
const CHAT_ID = 505829785;
const ru = t("ru");

// ── Fakes ─────────────────────────────────────────────────────────────

type Handler = (ctx: unknown) => Promise<unknown>;

function fakeBot() {
  const actions: Array<[RegExp | string, Handler]> = [];
  const bot = {
    command: () => {},
    on: () => {},
    action: (pattern: RegExp | string, handler: Handler) => actions.push([pattern, handler]),
  } as unknown as Telegraf;
  const find = (data: string) => {
    const hit = actions.find(([p]) => (typeof p === "string" ? p === data : p.test(data)));
    if (!hit) throw new Error(`no handler for ${data}`);
    const [pattern, handler] = hit;
    return { pattern, handler };
  };
  return { bot, find };
}

function tap(find: ReturnType<typeof fakeBot>["find"], data: string) {
  const { pattern, handler } = find(data);
  const ctx = {
    match: typeof pattern === "string" ? [data] : pattern.exec(data),
    chat: { id: CHAT_ID, type: "private" },
    from: { id: CHAT_ID, language_code: "ru" },
    answerCbQuery: vi.fn(async (_text?: string) => true),
    editMessageText: vi.fn(async (_text: string, _extra?: object) => ({ message_id: 7 })),
    telegram: { editMessageText: vi.fn(async () => true) },
  };
  return { ctx, done: handler(ctx) };
}

/** A lookup that stays pending until release() — the window the second tap hit. */
function holdLookup() {
  let release!: () => void;
  let fail!: (err: Error) => void;
  vi.mocked(resolveAccountAndAccessHash).mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        release = () => resolve({ accountId: "acc", accessHash: "hash" });
        fail = reject;
      }),
  );
  return { release: () => release(), fail: (err: Error) => fail(err) };
}

let getParticipantsCalls = 0;

function stubCrmApi() {
  getParticipantsCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = url.includes("/call/channels.getParticipants")
        ? (getParticipantsCalls++,
          { result: { _: "channels.channelParticipants", count: 0, participants: [], users: [] } })
        : { data: [], hasMore: false, cursors: { next: null, previous: null } };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() {
  for (let i = 0; i < 20; i++) await tick();
}

function makeConfig() {
  const config = new ConfigStore(join(tmpdir(), `double-tap-${Date.now()}-${Math.random()}.json`));
  config.setSession(CHAT_ID, {
    apiKey: "sk_test",
    workspaceId: "ws1",
    organizationId: "org1",
    authenticatedAt: new Date().toISOString(),
  });
  config.setChannelConfig(CHANNEL_ID, {
    channelId: CHANNEL_ID,
    channelTitle: "Gosha from the block",
    workspaceId: "ws1",
    accountId: "", // saved at promotion time, resolved on first sync
    accessHash: "",
    apiKey: "sk_test",
    addedAt: new Date().toISOString(),
  });
  return config;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(resolveAccountAndAccessHash).mockReset();
  stubCrmApi();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("sync claim", () => {
  it("allows one sync per channel and frees it on release", () => {
    const first = claimSync(1);
    expect(first).not.toBeNull();
    expect(claimSync(1)).toBeNull();
    expect(claimSync(2)).not.toBeNull();

    releaseSync(1, first!);
    const again = claimSync(1);
    expect(again).not.toBeNull();
    releaseSync(1, again!);
    releaseSync(2, claimSync(2) ?? new AbortController());
  });

  it("ignores a release from a controller that no longer owns the channel", () => {
    const owner = claimSync(3)!;
    releaseSync(3, new AbortController());
    expect(claimSync(3)).toBeNull();
    releaseSync(3, owner);
  });

  it("stop aborts the running sync but keeps the claim until it winds down", () => {
    const owner = claimSync(4)!;
    expect(stopSync(4)).toBe(true);
    expect(owner.signal.aborted).toBe(true);
    expect(claimSync(4)).toBeNull();
    releaseSync(4, owner);
    expect(stopSync(4)).toBe(false);
  });
});

describe("double tap on the sync button", () => {
  // Regression: tap 1 was stuck in the access-hash lookup with no visible
  // change; tap 2 overwrote the Stop button's controller and hit "message is
  // not modified". Landing a moment later it would have run a second sync.
  it("shows progress immediately and runs exactly one sync", async () => {
    const { bot, find } = fakeBot();
    registerSyncHandler(bot, makeConfig());
    const lookup = holdLookup();

    const first = tap(find, `sync_channel:${CHANNEL_ID}`);
    await tick();
    // Feedback before the lookup finishes, so there's nothing to re-tap for.
    expect(first.ctx.editMessageText).toHaveBeenCalledTimes(1);
    expect(first.ctx.editMessageText.mock.calls[0][0]).toContain("0/?");

    const second = tap(find, `sync_channel:${CHANNEL_ID}`);
    await second.done;
    expect(second.ctx.answerCbQuery).toHaveBeenCalledWith(ru.syncAlreadyRunning);
    expect(second.ctx.editMessageText).not.toHaveBeenCalled();

    lookup.release();
    await first.done;
    await settle();

    expect(getParticipantsCalls).toBe(1);
    // The finished sync freed the channel.
    const after = claimSync(CHANNEL_ID);
    expect(after).not.toBeNull();
    releaseSync(CHANNEL_ID, after!);
  });

  it("blocks the post-add 'Sync now' button while /sync is running, and vice versa", async () => {
    const { bot, find } = fakeBot();
    const config = makeConfig();
    registerSyncHandler(bot, config);
    registerMyChatMemberListener(bot, config);
    const lookup = holdLookup();

    const viaSync = tap(find, `sync_channel:${CHANNEL_ID}`);
    await tick();
    const viaSyncNow = tap(find, `sync_now:${CHANNEL_ID}`);
    await viaSyncNow.done;

    expect(viaSyncNow.ctx.answerCbQuery).toHaveBeenCalledWith(ru.syncAlreadyRunning);
    expect(resolveAccountAndAccessHash).toHaveBeenCalledTimes(1);

    lookup.release();
    await viaSync.done;
    await settle();
    expect(getParticipantsCalls).toBe(1);
  });

  it("frees the channel when the lookup fails, so the customer can retry", async () => {
    const { bot, find } = fakeBot();
    registerSyncHandler(bot, makeConfig());
    const lookup = holdLookup();

    const first = tap(find, `sync_channel:${CHANNEL_ID}`);
    await tick();
    lookup.fail(new Error("Could not resolve accessHash for channel -1001402968895"));
    await first.done;

    expect(first.ctx.editMessageText.mock.calls.at(-1)?.[0]).toContain(
      ru.errChannelNotVisible.split("\n")[0],
    );
    const retry = claimSync(CHANNEL_ID);
    expect(retry).not.toBeNull();
    releaseSync(CHANNEL_ID, retry!);
  });
});
