export interface PropertyMapping {
  propertyKey: string;       // e.g. "custom.stage"
  propertyName: string;      // human-readable, e.g. "Stage"
  joinValue: string;         // internal value set when user joins
  joinLabel: string;         // human-readable, e.g. "Subscriber"
  leaveValue: string;        // internal value set when user leaves
  leaveLabel: string;        // human-readable, e.g. "Unsubscribed"
}

export interface ChannelConfig {
  channelId: number;           // Telegram channel/group ID
  channelTitle: string;        // Human-readable name
  workspaceId: string;         // CRMChat workspace ID
  accountId: string;           // CRMChat Telegram account ID used for MTProto
  accessHash: string;          // MTProto access hash for the channel
  apiKey: string;              // CRMChat API key for this workspace
  propertyMapping?: PropertyMapping;  // optional property mapping
  addedAt: string;             // ISO date when bot was added
  lastSyncAt?: string;         // ISO date of last bulk sync
  subscriberCount?: number;    // last known subscriber count
}

export interface SessionData {
  apiKey: string;
  workspaceId: string;
  organizationId: string;
  authenticatedAt: string;     // ISO date
}

export type StatEvent =
  | "bot_started"
  | "workspace_connected"
  | "channel_connected"
  | "sync_completed";

export type DailyStats = Partial<Record<StatEvent, number>>;

export interface BotConfig {
  channels: Record<string, ChannelConfig>;  // keyed by channelId as string
  sessions: Record<string, SessionData>;    // keyed by Telegram chat ID (user DM)
  stats?: Record<string, DailyStats>;       // keyed by YYYY-MM-DD UTC
}
