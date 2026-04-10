import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAndCreateSession } from "./start.js";
import { ConfigStore } from "../config/store.js";

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── Setup ────────────────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.fn>;
let config: ConfigStore;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  config = new ConfigStore("/tmp/test-start-config.json");
});

// ── Tests ────────────────────────────────────────────────────────────

describe("validateAndCreateSession", () => {
  const chatId = 12345;

  it("valid API key creates session and returns workspace name", async () => {
    const orgs = [{ id: "org1", name: "Acme Corp" }];
    const workspaces = [{ id: "ws1", name: "Main Workspace" }];

    fetchSpy
      .mockResolvedValueOnce(jsonResponse(singlePage(orgs)))
      .mockResolvedValueOnce(jsonResponse(singlePage(workspaces)));

    const result = await validateAndCreateSession("sk_valid_key", config, chatId);

    expect(result).toEqual({ workspaceName: "Main Workspace" });

    const session = config.getSession(chatId);
    expect(session).toBeDefined();
    expect(session!.apiKey).toBe("sk_valid_key");
    expect(session!.workspaceId).toBe("ws1");
    expect(session!.organizationId).toBe("org1");
    expect(session!.authenticatedAt).toBeTruthy();
  });

  it("invalid API key (401) returns auth error message", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: "Unauthorized" }, 401),
    );

    const result = await validateAndCreateSession("sk_bad_key", config, chatId);

    expect(result).toEqual({
      error: "Invalid API key. Check Settings > API Keys in CRMChat.",
    });
    expect(config.getSession(chatId)).toBeUndefined();
  });

  it("API unreachable returns network error message", async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));

    const result = await validateAndCreateSession("sk_test", config, chatId);

    expect(result).toEqual({
      error: "Could not reach CRMChat API. Please try again.",
    });
    expect(config.getSession(chatId)).toBeUndefined();
  });

  it("no organizations found returns error", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(singlePage([])));

    const result = await validateAndCreateSession("sk_empty", config, chatId);

    expect(result).toEqual({
      error: "No organizations found for this API key.",
    });
  });

  it("no workspaces found returns error", async () => {
    const orgs = [{ id: "org1", name: "Acme" }];
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(singlePage(orgs)))
      .mockResolvedValueOnce(jsonResponse(singlePage([])));

    const result = await validateAndCreateSession("sk_no_ws", config, chatId);

    expect(result).toEqual({
      error: "No workspaces found for this organization.",
    });
  });

  it("workspace list failure returns network error", async () => {
    const orgs = [{ id: "org1", name: "Acme" }];
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(singlePage(orgs)))
      .mockRejectedValueOnce(new TypeError("fetch failed"));

    const result = await validateAndCreateSession("sk_ws_fail", config, chatId);

    expect(result).toEqual({
      error: "Could not reach CRMChat API. Please try again.",
    });
  });
});
