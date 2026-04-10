import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { BotConfig, ChannelConfig, SessionData } from "./types.js";

export class ConfigStore {
  private filePath: string;
  private config: BotConfig;
  private _saveChain: Promise<void> = Promise.resolve();

  constructor(filePath?: string) {
    this.filePath = filePath ?? "./data/config.json";
    this.config = { channels: {}, sessions: {} };
  }

  /** Await any in-flight save (useful for tests). */
  waitForSave(): Promise<void> {
    return this._saveChain;
  }

  private enqueueSave(): void {
    this._saveChain = this._saveChain.then(() => this._doSave());
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
      this.config = { channels: {}, sessions: {} };
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
}
