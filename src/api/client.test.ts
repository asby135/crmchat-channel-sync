import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CrmChatClient,
  ApiAuthError,
  RateLimitError,
  ApiError,
  extractErrorDetail,
  describeApiError,
} from "./client.js";

// ── Helpers ────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function singlePage<T>(data: T[]) {
  return { data, hasMore: false, cursors: { next: null, previous: null } };
}

// ── Setup ──────────────────────────────────────────────────────────────

let client: CrmChatClient;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  client = new CrmChatClient("sk_test_key", "https://api.test.local/v1");
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("CrmChatClient", () => {
  describe("listOrganizations", () => {
    it("returns organizations from a single page", async () => {
      const orgs = [{ id: "org1", name: "Acme" }];
      fetchSpy.mockResolvedValueOnce(jsonResponse(singlePage(orgs)));

      const result = await client.listOrganizations();

      expect(result).toEqual(orgs);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.test.local/v1/organizations");
      expect((init.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer sk_test_key",
      );
    });
  });

  describe("listWorkspaceMembers", () => {
    it("reads the bare data array (endpoint is not paginated)", async () => {
      const members = [
        { userId: "u1", role: "admin", user: { name: "Admin" } },
        { userId: "u2", role: "member", user: { name: "Member" } },
      ];
      fetchSpy.mockResolvedValueOnce(jsonResponse({ data: members }));

      const result = await client.listWorkspaceMembers("ws1");

      expect(result).toEqual(members);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.test.local/v1/workspaces/ws1/members");
    });
  });

  describe("createContact", () => {
    it("sends POST and returns the created contact", async () => {
      const contact = {
        id: "c1",
        fullName: "John Doe",
        workspaceId: "ws1",
        ownerId: "u1",
        telegram: { id: 123, username: "johndoe" },
      };
      fetchSpy.mockResolvedValueOnce(jsonResponse({ data: contact }));

      const result = await client.createContact("ws1", {
        fullName: "John Doe",
        telegram: { id: 123, username: "johndoe" },
      });

      expect(result).toEqual(contact);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.test.local/v1/workspaces/ws1/contacts");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        fullName: "John Doe",
        telegram: { id: 123, username: "johndoe" },
      });
    });
  });

  describe("error handling", () => {
    it("throws ApiAuthError on 401", async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ error: "invalid key" }, 401),
      );

      await expect(client.listOrganizations()).rejects.toThrow(ApiAuthError);
    });

    it("throws RateLimitError on 429 with retryAfter", async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ error: "slow down" }, 429, { "retry-after": "30" }),
      );

      try {
        await client.listOrganizations();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect((err as RateLimitError).retryAfter).toBe(30);
      }
    });

    it("throws ApiError on other status codes", async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ error: "server error" }, 500),
      );

      await expect(client.listOrganizations()).rejects.toThrow(ApiError);
    });
  });

  describe("pagination", () => {
    it("follows cursors until hasMore is false", async () => {
      const page1 = {
        data: [{ id: "org1", name: "Org 1" }],
        hasMore: true,
        cursors: { next: "cursor_abc", previous: null },
      };
      const page2 = {
        data: [{ id: "org2", name: "Org 2" }],
        hasMore: false,
        cursors: { next: null, previous: "cursor_abc" },
      };

      fetchSpy
        .mockResolvedValueOnce(jsonResponse(page1))
        .mockResolvedValueOnce(jsonResponse(page2));

      const result = await client.listOrganizations();

      expect(result).toEqual([
        { id: "org1", name: "Org 1" },
        { id: "org2", name: "Org 2" },
      ]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const secondUrl = (fetchSpy.mock.calls[1] as [string])[0];
      expect(secondUrl).toContain("startingAfter=cursor_abc");
    });
  });

  describe("updateContact (PATCH)", () => {
    it("uses application/merge-patch+json content-type", async () => {
      const contact = {
        id: "c1",
        fullName: "Jane Doe",
        workspaceId: "ws1",
        ownerId: "u1",
      };
      fetchSpy.mockResolvedValueOnce(jsonResponse({ data: contact }));

      await client.updateContact("ws1", "c1", { fullName: "Jane Doe" });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.test.local/v1/workspaces/ws1/contacts/c1");
      expect(init.method).toBe("PATCH");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/merge-patch+json",
      );
    });
  });

  describe("listContacts", () => {
    it("passes filters as query params", async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(singlePage([])));

      await client.listContacts("ws1", {
        filter: { "telegram.id": 12345 },
      });

      const url = (fetchSpy.mock.calls[0] as [string])[0];
      expect(url).toContain("filter%5Btelegram.id%5D=12345");
    });
  });

  describe("callTelegramRaw", () => {
    it("sends method in URL path and params in request body", async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ result: { users: [] } }),
      );

      const result = await client.callTelegramRaw("ws1", "acc1", "contacts.search", {
        q: "test",
      });

      expect(result).toEqual({ users: [] });
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/telegram-accounts/acc1/call/contacts.search");
      expect(JSON.parse(init.body as string)).toEqual({
        params: { q: "test" },
      });
    });
  });
});

// ── Error detail ─────────────────────────────────────────────────────

describe("extractErrorDetail", () => {
  it("surfaces the raw Telegram RPC error text", () => {
    // dc-proxy wraps tl.RpcError as BAD_REQUEST with message = err.text
    const body = JSON.stringify({
      defined: true,
      code: "BAD_REQUEST",
      status: 400,
      message: "CHANNEL_INVALID",
      data: { code: "TELEGRAM_RPC_ERROR", tlErrorCode: 400, tlErrorMessage: "CHANNEL_INVALID" },
    });

    expect(extractErrorDetail(body)).toBe("CHANNEL_INVALID");
  });

  it("keeps FLOOD_WAIT_N intact so flood retry can parse it", () => {
    // withFloodRetry in handlers/sync.ts matches this regex against err.message.
    // Before the body was surfaced, MTProto flood waits arrived as a bare
    // "Bad Request" and the retry never fired.
    const body = JSON.stringify({ code: "BAD_REQUEST", message: "FLOOD_WAIT_42" });

    const message = describeApiError(400, "Bad Request", body);

    expect(message.match(/FLOOD_WAIT_(\d+)/)?.[1]).toBe("42");
  });

  it("appends validation issues to the message", () => {
    const body = JSON.stringify({
      code: "BAD_REQUEST",
      message: "Input validation failed",
      data: { issues: [{ path: ["ownerId"], message: "Property is required" }] },
    });

    expect(extractErrorDetail(body)).toBe(
      "Input validation failed (ownerId: Property is required)",
    );
  });

  it("handles a string path from the property validator", () => {
    const body = JSON.stringify({
      message: "Input validation failed",
      data: { issues: [{ path: "custom.stage", message: "Invalid option" }] },
    });

    expect(extractErrorDetail(body)).toBe(
      "Input validation failed (custom.stage: Invalid option)",
    );
  });

  it("falls back to the code when there is no message", () => {
    expect(extractErrorDetail(JSON.stringify({ code: "FORBIDDEN" }))).toBe("FORBIDDEN");
  });

  it("ignores an HTML error page", () => {
    expect(extractErrorDetail("<html><body>502 Bad Gateway</body></html>")).toBeUndefined();
  });

  it("passes through short non-JSON text", () => {
    expect(extractErrorDetail("upstream timeout")).toBe("upstream timeout");
  });

  it("truncates a long body", () => {
    const detail = extractErrorDetail(JSON.stringify({ message: "x".repeat(500) }));
    expect(detail).toHaveLength(300);
    expect(detail?.endsWith("\u2026")).toBe(true);
  });

  it("returns undefined for an empty or missing body", () => {
    expect(extractErrorDetail(undefined)).toBeUndefined();
    expect(extractErrorDetail("   ")).toBeUndefined();
  });
});

describe("describeApiError", () => {
  it("uses the server explanation when there is one", () => {
    const body = JSON.stringify({ message: "CHAT_ADMIN_REQUIRED" });
    expect(describeApiError(400, "Bad Request", body)).toBe(
      "API error 400: CHAT_ADMIN_REQUIRED",
    );
  });

  it("falls back to the status text when the body says nothing", () => {
    expect(describeApiError(500, "Internal Server Error")).toBe(
      "API error 500: Internal Server Error",
    );
  });
});

describe("request error messages", () => {
  it("puts the Telegram error into the thrown ApiError message", async () => {
    const body = JSON.stringify({ code: "BAD_REQUEST", message: "CHANNEL_INVALID" });
    fetchSpy.mockResolvedValueOnce(
      new Response(body, { status: 400, statusText: "Bad Request" }),
    );

    await expect(client.listContacts("ws1")).rejects.toThrow(
      "API error 400: CHANNEL_INVALID",
    );
  });
});
