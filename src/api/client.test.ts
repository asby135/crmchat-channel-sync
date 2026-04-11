import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrmChatClient, ApiAuthError, RateLimitError, ApiError } from "./client.js";

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
