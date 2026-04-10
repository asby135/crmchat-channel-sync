import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFullName, bulkSync, type SyncResult } from "./sync.js";
import { CrmChatClient } from "../api/client.js";

// ── Mock sleep to speed up tests ──────────────────────────────────────

vi.mock("../lib/rate-limiter.js", () => ({
  sleep: vi.fn(() => Promise.resolve()),
}));

// ── Helpers ───────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

function singlePage<T>(data: T[]) {
  return { data, hasMore: false, cursors: { next: null, previous: null } };
}

function makeParticipantsResponse(
  users: Array<{
    id: number;
    firstName?: string;
    lastName?: string;
    username?: string;
    deleted?: boolean;
  }>,
) {
  return {
    result: {
      _: "channels.channelParticipants",
      count: users.length,
      participants: users.map((u) => ({
        _: "channelParticipant",
        userId: u.id,
        date: 1700000000,
      })),
      users: users.map((u) => ({
        _: "user",
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        deleted: u.deleted,
      })),
    },
  };
}

function makeEmptyParticipantsResponse() {
  return {
    result: {
      _: "channels.channelParticipants",
      count: 0,
      participants: [],
      users: [],
    },
  };
}

function makeContact(telegramId: number, name: string) {
  return {
    id: `contact-${telegramId}`,
    fullName: name,
    workspaceId: "ws1",
    ownerId: "owner1",
    telegram: { id: telegramId, username: `user${telegramId}` },
  };
}

// ── Setup ─────────────────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

const defaultOptions = {
  workspaceId: "ws1",
  accountId: "acc1",
  channelId: 12345,
  accessHash: "abc123",
};

// ── buildFullName tests ───────────────────────────────────────────────

describe("buildFullName", () => {
  it("returns first and last name joined", () => {
    expect(buildFullName("John", "Doe")).toBe("John Doe");
  });

  it("returns only first name when last is undefined", () => {
    expect(buildFullName("John", undefined)).toBe("John");
  });

  it("returns fallback when both are undefined", () => {
    expect(buildFullName(undefined, undefined, 12345)).toBe("User 12345");
  });

  it("returns fallback when both are empty strings", () => {
    expect(buildFullName("", "", 12345)).toBe("User 12345");
  });
});

// ── bulkSync tests ────────────────────────────────────────────────────

describe("bulkSync", () => {
  it("creates all contacts when none exist", async () => {
    const users = [
      { id: 100, firstName: "Alice", lastName: "A", username: "alice" },
      { id: 200, firstName: "Bob", lastName: "B", username: "bob" },
      { id: 300, firstName: "Carol", lastName: "C", username: "carol" },
    ];

    fetchSpy
      // listContacts (paginated, returns empty)
      .mockResolvedValueOnce(jsonResponse(singlePage([])))
      // callTelegramRaw - first page with 3 participants
      .mockResolvedValueOnce(jsonResponse(makeParticipantsResponse(users)))
      // createContact for Alice
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(100, "Alice A") }),
      )
      // createContact for Bob
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(200, "Bob B") }),
      )
      // createContact for Carol
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(300, "Carol C") }),
      );

    const client = new CrmChatClient("sk_test");
    const result = await bulkSync({ ...defaultOptions, client });

    expect(result).toEqual({
      created: 3,
      existing: 0,
      private: 0,
      failed: 0,
      total: 3,
    });
  });

  it("skips existing contacts", async () => {
    const users = [
      { id: 100, firstName: "Alice", username: "alice" },
      { id: 200, firstName: "Bob", username: "bob" },
      { id: 300, firstName: "Carol", username: "carol" },
    ];

    fetchSpy
      // listContacts returns one existing contact (Bob)
      .mockResolvedValueOnce(
        jsonResponse(singlePage([makeContact(200, "Bob B")])),
      )
      // callTelegramRaw
      .mockResolvedValueOnce(jsonResponse(makeParticipantsResponse(users)))
      // createContact for Alice
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(100, "Alice") }),
      )
      // createContact for Carol
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(300, "Carol") }),
      );

    const client = new CrmChatClient("sk_test");
    const result = await bulkSync({ ...defaultOptions, client });

    expect(result).toEqual({
      created: 2,
      existing: 1,
      private: 0,
      failed: 0,
      total: 3,
    });
  });

  it("counts deleted users as private", async () => {
    const users = [
      { id: 100, firstName: "Alice", username: "alice" },
      { id: 200, firstName: "Ghost", deleted: true },
    ];

    fetchSpy
      .mockResolvedValueOnce(jsonResponse(singlePage([])))
      .mockResolvedValueOnce(jsonResponse(makeParticipantsResponse(users)))
      // createContact for Alice only
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(100, "Alice") }),
      );

    const client = new CrmChatClient("sk_test");
    const result = await bulkSync({ ...defaultOptions, client });

    expect(result).toEqual({
      created: 1,
      existing: 0,
      private: 1,
      failed: 0,
      total: 2,
    });
  });

  it("counts failed contact creation and continues", async () => {
    const users = [
      { id: 100, firstName: "Alice", username: "alice" },
      { id: 200, firstName: "Bob", username: "bob" },
      { id: 300, firstName: "Carol", username: "carol" },
    ];

    fetchSpy
      .mockResolvedValueOnce(jsonResponse(singlePage([])))
      .mockResolvedValueOnce(jsonResponse(makeParticipantsResponse(users)))
      // Alice: success
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(100, "Alice") }),
      )
      // Bob: failure (500)
      .mockResolvedValueOnce(
        jsonResponse({ error: "Internal error" }, 500),
      )
      // Carol: success
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(300, "Carol") }),
      );

    const client = new CrmChatClient("sk_test");

    // Suppress console.error for expected failure
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await bulkSync({ ...defaultOptions, client });
    consoleSpy.mockRestore();

    expect(result).toEqual({
      created: 2,
      existing: 0,
      private: 0,
      failed: 1,
      total: 3,
    });
  });

  it("handles empty channel", async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(singlePage([])))
      .mockResolvedValueOnce(jsonResponse(makeEmptyParticipantsResponse()));

    const client = new CrmChatClient("sk_test");
    const result = await bulkSync({ ...defaultOptions, client });

    expect(result).toEqual({
      created: 0,
      existing: 0,
      private: 0,
      failed: 0,
      total: 0,
    });
  });

  it("fires onProgress callback with correct counts", async () => {
    // Create exactly 3 users (less than 200 so progress fires at the end)
    const users = [
      { id: 100, firstName: "Alice" },
      { id: 200, firstName: "Bob" },
      { id: 300, firstName: "Carol" },
    ];

    fetchSpy
      .mockResolvedValueOnce(jsonResponse(singlePage([])))
      .mockResolvedValueOnce(jsonResponse(makeParticipantsResponse(users)))
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(100, "Alice") }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(200, "Bob") }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(300, "Carol") }),
      );

    const client = new CrmChatClient("sk_test");
    const progressCalls: Array<[number, number]> = [];
    const onProgress = (synced: number, total: number) => {
      progressCalls.push([synced, total]);
    };

    await bulkSync({ ...defaultOptions, client, onProgress });

    // Should fire at least once (at the end since total < 200)
    expect(progressCalls.length).toBeGreaterThan(0);
    // The last call should be [3, 3]
    expect(progressCalls[progressCalls.length - 1]).toEqual([3, 3]);
  });

  it("applies property mapping when creating contacts", async () => {
    const users = [{ id: 100, firstName: "Alice" }];

    fetchSpy
      .mockResolvedValueOnce(jsonResponse(singlePage([])))
      .mockResolvedValueOnce(jsonResponse(makeParticipantsResponse(users)))
      .mockResolvedValueOnce(
        jsonResponse({ data: makeContact(100, "Alice") }),
      );

    const client = new CrmChatClient("sk_test");
    await bulkSync({
      ...defaultOptions,
      client,
      propertyMapping: {
        propertyKey: "custom.stage",
        joinValue: "subscriber",
        leaveValue: "unsubscribed",
      },
    });

    // Verify the createContact call included custom field
    // The 3rd fetch call (index 2) is the createContact
    const createCall = fetchSpy.mock.calls[2];
    const body = JSON.parse(createCall[1].body);
    expect(body.custom).toEqual({ stage: "subscriber" });
  });
});
