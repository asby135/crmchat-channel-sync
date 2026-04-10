import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, rm, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigStore } from "./store.js";
import type { ChannelConfig, SessionData } from "./types.js";

function tmpConfigPath(): string {
  return join(
    tmpdir(),
    `config-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
}

function makeChannelConfig(overrides: Partial<ChannelConfig> = {}): ChannelConfig {
  return {
    channelId: -1001234567890,
    channelTitle: "Test Channel",
    workspaceId: "ws-1",
    accountId: "acc-1",
    accessHash: "0",
    apiKey: "key-1",
    addedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    apiKey: "sess-key-1",
    workspaceId: "ws-1",
    organizationId: "org-1",
    authenticatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ConfigStore", () => {
  let filePath: string;
  let store: ConfigStore;

  beforeEach(() => {
    filePath = tmpConfigPath();
    store = new ConfigStore(filePath);
  });

  afterEach(async () => {
    await store.waitForSave();
    try {
      await rm(filePath, { force: true });
      await rm(`${filePath}.tmp`, { force: true });
    } catch {
      // ignore
    }
  });

  it("loads from non-existent file -> empty config", async () => {
    await store.load();
    expect(store.getAllChannelConfigs()).toEqual([]);
    expect(store.getChannelConfig(123)).toBeUndefined();
    expect(store.getSession(456)).toBeUndefined();
  });

  it("set channel config -> persists to file", async () => {
    await store.load();
    const config = makeChannelConfig({ channelId: 100 });
    store.setChannelConfig(100, config);
    await store.waitForSave();

    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.channels["100"]).toEqual(config);
  });

  it("get channel config -> returns what was set", async () => {
    await store.load();
    const config = makeChannelConfig({ channelId: 200 });
    store.setChannelConfig(200, config);

    expect(store.getChannelConfig(200)).toEqual(config);
  });

  it("remove channel config -> gone from file", async () => {
    await store.load();
    const config = makeChannelConfig({ channelId: 300 });
    store.setChannelConfig(300, config);
    await store.waitForSave();

    expect(store.getChannelConfig(300)).toEqual(config);

    store.removeChannelConfig(300);
    await store.waitForSave();

    expect(store.getChannelConfig(300)).toBeUndefined();

    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.channels["300"]).toBeUndefined();
  });

  it("getAllChannelConfigs -> returns all", async () => {
    await store.load();
    const c1 = makeChannelConfig({ channelId: 1 });
    const c2 = makeChannelConfig({ channelId: 2 });
    store.setChannelConfig(1, c1);
    store.setChannelConfig(2, c2);

    const all = store.getAllChannelConfigs();
    expect(all).toHaveLength(2);
    expect(all).toContainEqual(c1);
    expect(all).toContainEqual(c2);
  });

  it("getChannelsByWorkspace -> filters correctly", async () => {
    await store.load();
    const c1 = makeChannelConfig({ channelId: 1, workspaceId: "ws-A" });
    const c2 = makeChannelConfig({ channelId: 2, workspaceId: "ws-B" });
    const c3 = makeChannelConfig({ channelId: 3, workspaceId: "ws-A" });
    store.setChannelConfig(1, c1);
    store.setChannelConfig(2, c2);
    store.setChannelConfig(3, c3);

    const wsA = store.getChannelsByWorkspace("ws-A");
    expect(wsA).toHaveLength(2);
    expect(wsA).toContainEqual(c1);
    expect(wsA).toContainEqual(c3);

    const wsB = store.getChannelsByWorkspace("ws-B");
    expect(wsB).toHaveLength(1);
    expect(wsB).toContainEqual(c2);

    expect(store.getChannelsByWorkspace("ws-none")).toEqual([]);
  });

  describe("Session CRUD", () => {
    it("set and get session", async () => {
      await store.load();
      const session = makeSession();
      store.setSession(999, session);

      expect(store.getSession(999)).toEqual(session);
    });

    it("remove session", async () => {
      await store.load();
      const session = makeSession();
      store.setSession(999, session);
      expect(store.getSession(999)).toEqual(session);

      store.removeSession(999);
      expect(store.getSession(999)).toBeUndefined();
    });

    it("session persists to file", async () => {
      await store.load();
      const session = makeSession();
      store.setSession(555, session);
      await store.waitForSave();

      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.sessions["555"]).toEqual(session);
    });
  });

  it("corrupted JSON file -> logs warning, returns empty config", async () => {
    const dir = join(filePath, "..");
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, "{bad json!!", "utf-8");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await store.load();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Corrupted config file")
    );
    expect(store.getAllChannelConfigs()).toEqual([]);

    warnSpy.mockRestore();
  });

  it("atomic write (file exists after save)", async () => {
    await store.load();
    store.setChannelConfig(1, makeChannelConfig({ channelId: 1 }));
    await store.waitForSave();

    expect(existsSync(filePath)).toBe(true);
    // tmp file should not remain
    expect(existsSync(`${filePath}.tmp`)).toBe(false);
  });
});
