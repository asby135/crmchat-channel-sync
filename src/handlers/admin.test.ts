import { describe, it, expect, beforeEach } from "vitest";
import { ConfigStore } from "../config/store.js";
import { parseAdminIds, formatAdminStats } from "./admin.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";

let store: ConfigStore;
const tmpFile = join(tmpdir(), `cp-admin-test-${Date.now()}.json`);

beforeEach(async () => {
  await rm(tmpFile, { force: true });
  store = new ConfigStore(tmpFile);
  await store.load();
});

describe("parseAdminIds", () => {
  it("parses comma-separated and space-separated lists", () => {
    expect(parseAdminIds("123,456 789")).toEqual(new Set([123, 456, 789]));
  });

  it("returns an empty set for undefined / empty / whitespace", () => {
    expect(parseAdminIds(undefined)).toEqual(new Set());
    expect(parseAdminIds("")).toEqual(new Set());
    expect(parseAdminIds("   ")).toEqual(new Set());
  });

  it("ignores non-numeric and non-positive entries", () => {
    expect(parseAdminIds("123, abc, -1, 0, 456")).toEqual(new Set([123, 456]));
  });
});

describe("ConfigStore stats", () => {
  it("rolls up the trailing N days inclusive of today", () => {
    const today = new Date("2026-04-15T12:00:00Z");
    // 3 events today, 2 yesterday, 1 last week
    store.incrementStat("bot_started", today);
    store.incrementStat("bot_started", today);
    store.incrementStat("bot_started", today);
    const yesterday = new Date("2026-04-14T12:00:00Z");
    store.incrementStat("bot_started", yesterday);
    store.incrementStat("workspace_connected", yesterday);
    const lastWeek = new Date("2026-04-09T12:00:00Z");
    store.incrementStat("bot_started", lastWeek);

    const week = store.rollupStats(7, today);
    expect(week.bot_started).toBe(5); // today + yesterday + 7 days back inclusive
    expect(week.workspace_connected).toBe(1);
    expect(week.channel_connected).toBe(0);
    expect(week.sync_completed).toBe(0);
  });

  it("ignores days outside the window", () => {
    const today = new Date("2026-04-15T12:00:00Z");
    const longAgo = new Date("2026-01-01T12:00:00Z");
    store.incrementStat("bot_started", today);
    store.incrementStat("bot_started", longAgo);

    const week = store.rollupStats(7, today);
    expect(week.bot_started).toBe(1);

    const month = store.rollupStats(30, today);
    expect(month.bot_started).toBe(1);
  });
});

describe("formatAdminStats", () => {
  it("renders a 4-stage funnel with conversion percentages", () => {
    const week = {
      bot_started: 100,
      workspace_connected: 50,
      channel_connected: 25,
      sync_completed: 10,
    };
    const month = {
      bot_started: 400,
      workspace_connected: 200,
      channel_connected: 100,
      sync_completed: 40,
    };

    const out = formatAdminStats(week, month);
    expect(out).toContain("Admin stats");
    expect(out).toContain("Bot started");
    expect(out).toContain("Workspace connected");
    expect(out).toContain("Channel connected");
    expect(out).toContain("Sync completed");
    // Conversions: 50/100 = 50%, 25/50 = 50%, 10/25 = 40%
    expect(out).toMatch(/50%/);
    expect(out).toMatch(/40%/);
    // First row has no % column
    expect(out).not.toMatch(/Bot started.*100%/);
  });

  it("shows em-dash for percentages when previous stage is zero", () => {
    const empty = {
      bot_started: 0,
      workspace_connected: 0,
      channel_connected: 0,
      sync_completed: 0,
    };
    const out = formatAdminStats(empty, empty);
    expect(out).toContain("—");
  });
});
