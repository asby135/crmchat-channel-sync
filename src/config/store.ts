import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  BotConfig,
  ChannelConfig,
  SessionData,
  StatEvent,
  DailyStats,
} from "./types.js";

export class ConfigStore {
  private filePath: string;
  private config: BotConfig;
  private _saveChain: Promise<void> = Promise.resolve();

  constructor(filePath?: string) {
    this.filePath = filePath ?? process.env.CONFIG_PATH ?? "./data/config.json";
    this.config = { channels: {}, sessions: {}, stats: {} };
  }

  /** Await any in-flight save (useful for tests). */
  waitForSave(): Promise<void> {
    return this._saveChain;
  }

  private enqueueSave(): void {
    this._saveChain = this._saveChain.then(() => this._doSave()).catch(err => {
      console.error("[ConfigStore] Save failed:", err);
    });
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.config = JSON.parse(raw) as BotConfig;
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        console.warn(
          `[ConfigStore] Corrupted config file at ${this.filePath}, initializing empty config`
        );
      }
      // File doesn't exist or is corrupted — start fresh
      this.config = { channels: {}, sessions: {}, stats: {} };
    }
  }

  async save(): Promise<void> {
    this.enqueueSave();
    await this._saveChain;
  }

  private async _doSave(): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(this.config, null, 2), "utf-8");
    await rename(tmpPath, this.filePath);
  }

  // --- Channel configs ---

  getChannelConfig(channelId: number): ChannelConfig | undefined {
    return this.config.channels[String(channelId)];
  }

  setChannelConfig(channelId: number, config: ChannelConfig): void {
    this.config.channels[String(channelId)] = config;
    this.enqueueSave();
  }

  removeChannelConfig(channelId: number): void {
    delete this.config.channels[String(channelId)];
    this.enqueueSave();
  }

  getAllChannelConfigs(): ChannelConfig[] {
    return Object.values(this.config.channels);
  }

  // --- Sessions ---

  getSession(chatId: number): SessionData | undefined {
    return this.config.sessions[String(chatId)];
  }

  setSession(chatId: number, session: SessionData): void {
    this.config.sessions[String(chatId)] = session;
    this.enqueueSave();
  }

  removeSession(chatId: number): void {
    delete this.config.sessions[String(chatId)];
    this.enqueueSave();
  }

  // --- Lookups ---

  getChannelsByWorkspace(workspaceId: string): ChannelConfig[] {
    return Object.values(this.config.channels).filter(
      (c) => c.workspaceId === workspaceId
    );
  }

  // --- Stats (per-day counters keyed by YYYY-MM-DD UTC) ---

  /** Increment the counter for `event` on today's UTC date. */
  incrementStat(event: StatEvent, now: Date = new Date()): void {
    const key = isoDate(now);
    if (!this.config.stats) this.config.stats = {};
    const day = this.config.stats[key] ?? {};
    day[event] = (day[event] ?? 0) + 1;
    this.config.stats[key] = day;
    this.enqueueSave();
  }

  /**
   * Sum each stat over the trailing `days` UTC days, ending at `now` (inclusive).
   * `days = 7` returns the rolling week including today.
   */
  rollupStats(days: number, now: Date = new Date()): Record<StatEvent, number> {
    const out: Record<StatEvent, number> = {
      bot_started: 0,
      workspace_connected: 0,
      channel_connected: 0,
      sync_completed: 0,
    };
    const stats = this.config.stats ?? {};
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const day = stats[isoDate(d)];
      if (!day) continue;
      for (const k of Object.keys(out) as StatEvent[]) {
        out[k] += day[k] ?? 0;
      }
    }
    return out;
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// Re-export for tests / consumers that only import from store.
export type { DailyStats };
