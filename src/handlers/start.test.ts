import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAndCreateSession, buildWorkspacePicker, WORKSPACE_PAGE_SIZE } from "./start.js";
import { ConfigStore } from "../config/store.js";
import { t } from "../i18n/index.js";
import type { Workspace } from "../api/types.js";

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
    const workspaces = [{ id: "ws1", name: "Main Workspace", organizationId: "org1" }];

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

  it("aggregates workspaces across multiple organizations", async () => {
    const { validateApiKey } = await import("./start.js");
    const orgs = [
      { id: "org1", name: "Acme" },
      { id: "org2", name: "NewCo" },
    ];
    const wsOrg1 = [{ id: "ws1", name: "Acme Main", organizationId: "org1" }];
    const wsOrg2 = [{ id: "ws2", name: "NewCo Main", organizationId: "org2" }];

    fetchSpy
      .mockResolvedValueOnce(jsonResponse(singlePage(orgs)))
      .mockResolvedValueOnce(jsonResponse(singlePage(wsOrg1)))
      .mockResolvedValueOnce(jsonResponse(singlePage(wsOrg2)));

    const result = await validateApiKey("sk_multi_org");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.workspaces.map((w) => w.id).sort()).toEqual(["ws1", "ws2"]);
    expect(result.workspaces.find((w) => w.id === "ws2")?.organizationId).toBe("org2");
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

// ── Workspace picker ─────────────────────────────────────────────────

type Button = { text: string; callback_data: string };

function keyboardOf(extra: object): Button[][] {
  return (extra as { reply_markup: { inline_keyboard: Button[][] } }).reply_markup
    .inline_keyboard;
}

function makeWorkspaces(n: number): Workspace[] {
  // Ids shaped like Firestore auto-ids (20 chars) so callback_data length is realistic.
  return Array.from({ length: n }, (_, i) => ({
    id: `ws${String(i).padStart(18, "0")}`,
    name: `Workspace ${String(i).padStart(3, "0")}`,
    organizationId: `org${String(i % 7).padStart(17, "0")}`,
  }));
}

describe("buildWorkspacePicker", () => {
  const l = t("en");

  // Regression: an agency API key with >100 workspaces produced one button each,
  // and Telegram rejected the message with "reply markup is too long".
  it("stays far under Telegram's 100-button limit for a huge workspace list", () => {
    const workspaces = makeWorkspaces(150);
    const pages = Math.ceil(150 / WORKSPACE_PAGE_SIZE);

    for (let page = 0; page < pages; page++) {
      const buttons = keyboardOf(buildWorkspacePicker(workspaces, page, l).extra).flat();
      expect(buttons.length).toBeLessThanOrEqual(WORKSPACE_PAGE_SIZE + 3);
    }
  });

  it("covers every workspace exactly once across pages", () => {
    const workspaces = makeWorkspaces(35);
    const seen = new Set<string>();
    for (let page = 0; page < 4; page++) {
      for (const b of keyboardOf(buildWorkspacePicker(workspaces, page, l).extra).flat()) {
        if (b.callback_data.startsWith("pick_ws:")) seen.add(b.callback_data);
      }
    }
    expect(seen.size).toBe(35);
  });

  it("shows no nav row when everything fits on one page", () => {
    const rows = keyboardOf(buildWorkspacePicker(makeWorkspaces(3), 0, l).extra);
    expect(rows).toHaveLength(3);
    expect(rows.flat().every((b) => b.callback_data.startsWith("pick_ws:"))).toBe(true);
  });

  it("omits back on the first page and forward on the last", () => {
    const workspaces = makeWorkspaces(25);

    const first = keyboardOf(buildWorkspacePicker(workspaces, 0, l).extra).at(-1)!;
    expect(first.map((b) => b.callback_data)).toEqual(["noop", "ws_page:1"]);
    expect(first[0].text).toBe("1/3");

    const last = keyboardOf(buildWorkspacePicker(workspaces, 2, l).extra).at(-1)!;
    expect(last.map((b) => b.callback_data)).toEqual(["ws_page:1", "noop"]);
  });

  it("clamps an out-of-range page", () => {
    const result = buildWorkspacePicker(makeWorkspaces(25), 99, l);
    expect(result.page).toBe(2);
    expect(buildWorkspacePicker(makeWorkspaces(25), -5, l).page).toBe(0);
  });

  it("sorts by name and keeps the pick_ws callback format", () => {
    const workspaces: Workspace[] = [
      { id: "b", name: "Beta", organizationId: "o1" },
      { id: "a", name: "Alpha", organizationId: "o2" },
    ];
    const buttons = keyboardOf(buildWorkspacePicker(workspaces, 0, l).extra).flat();
    expect(buttons.map((b) => b.text)).toEqual(["Alpha", "Beta"]);
    expect(buttons[0].callback_data).toBe("pick_ws:a:o2");
  });

  it("keeps every callback_data within Telegram's 64-byte limit", () => {
    const workspaces = makeWorkspaces(150);
    for (let page = 0; page < 15; page++) {
      for (const b of keyboardOf(buildWorkspacePicker(workspaces, page, l).extra).flat()) {
        expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
      }
    }
  });

  it("mentions the workspace count only when paginated", () => {
    expect(buildWorkspacePicker(makeWorkspaces(3), 0, l).text).toBe(l.pickWorkspace);
    expect(buildWorkspacePicker(makeWorkspaces(150), 0, l).text).toContain("150");
  });
});
