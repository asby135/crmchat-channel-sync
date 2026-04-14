import { Markup, type Telegraf } from "telegraf";
import { CrmChatClient } from "../api/client.js";
import type { Property } from "../api/types.js";
import type { ConfigStore } from "../config/store.js";
import type { ChannelConfig, PropertyMapping } from "../config/types.js";
import { t, type Locale } from "../i18n/index.js";

// ── Callback data cache (Telegram 64-byte limit workaround) ────────

let callbackSeq = 0;
const callbackCache = new Map<string, Record<string, string>>();

function storeCallback(prefix: string, data: Record<string, string>): string {
  if (callbackCache.size > 500) {
    callbackCache.clear();
  }
  const key = `${prefix}:${++callbackSeq}`;
  callbackCache.set(key, data);
  return key;
}

function lookupCallback(key: string): Record<string, string> | undefined {
  const data = callbackCache.get(key);
  if (data) callbackCache.delete(key);
  return data;
}

// ── State machine for text input ────────────────────────────────────

interface TextInputState {
  phase: "waiting_for_join_value" | "waiting_for_leave_value";
  channelId: number;
  propKey: string;
  propName: string;
  joinValue?: string; // set when moving to leave phase
}

const textInputStates = new Map<number, TextInputState>();

/** Check if a chat is currently in a settings text-input flow. */
export function isInTextInputFlow(chatId: number): boolean {
  return textInputStates.has(chatId);
}

// ── Helpers ─────────────────────────────────────────────────────────

export function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatChannelSettings(ch: ChannelConfig, l: Locale): string {
  const m = ch.propertyMapping;
  const lines = [
    l.settingsForChannel(ch.channelTitle),
    "",
    m ? l.settingsProperty(m.propertyName) : l.settingsPropertyNotSet,
    m?.joinLabel ? l.settingsOnJoin(m.joinLabel) : l.settingsOnJoinNone,
    m?.leaveLabel ? l.settingsOnLeave(m.leaveLabel) : l.settingsOnLeaveNone,
    ch.lastSyncAt ? l.settingsLastSync(formatTimeAgo(ch.lastSyncAt)) : l.settingsLastSyncNever,
    ch.subscriberCount != null
      ? l.settingsSubscribers(String(ch.subscriberCount))
      : l.settingsSubscribersUnknown,
  ];
  return lines.join("\n");
}

function channelSettingsKeyboard(channelId: number, l: Locale) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(l.settingsBtnSetMapping, `set_mapping:${channelId}`),
      Markup.button.callback(l.settingsBtnRemoveMapping, `remove_mapping:${channelId}`),
    ],
    [Markup.button.callback(l.settingsBtnBack, "settings_back")],
  ]);
}

// Keyboard shown right after a property mapping is saved, so the user can
// kick off a sync without hunting for /sync.
function mappingSavedKeyboard(channelId: number, l: Locale) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(l.syncNowBtn, `sync_channel:${channelId}`)],
    [
      Markup.button.callback(l.mainMenuBtn, `main_menu:${channelId}`),
      Markup.button.callback(l.settingsBtnBack, "settings_back"),
    ],
  ]);
}

function isConfigurableProperty(prop: Property): boolean {
  if (!prop.key.startsWith("custom.")) return false;
  return prop.type === "single-select" || prop.type === "text";
}

// ── Handler registration ────────────────────────────────────────────

export function registerSettingsHandler(
  bot: Telegraf,
  config: ConfigStore,
): void {
  // /settings command: list tracked channels
  bot.command("settings", async (ctx) => {
    const chatId = ctx.chat.id;
    const lang = ctx.from?.language_code;
    const l = t(lang);
    const session = config.getSession(chatId);

    if (!session) {
      await ctx.reply(l.settingsNeedConnect);
      return;
    }

    const channels = config.getChannelsByWorkspace(session.workspaceId);
    if (channels.length === 0) {
      await ctx.reply(l.settingsNoChannels);
      return;
    }

    const buttons = channels.map((ch) =>
      Markup.button.callback(
        ch.channelTitle,
        `settings_channel:${ch.channelId}`,
      ),
    );

    await ctx.reply(l.settingsChooseChannel, {
      ...Markup.inlineKeyboard(buttons, { columns: 2 }),
    });
  });

  // Step 3: user picks a channel -> show settings
  bot.action(/^settings_channel:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    const lang = ctx.from?.language_code;
    const l = t(lang);
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText(l.settingsChannelNotFound);
      return;
    }

    await ctx.editMessageText(formatChannelSettings(ch, l), {
      ...channelSettingsKeyboard(channelId, l),
    });
  });

  // "Main menu" -> rebuild the "bot added to channel" promotion prompt
  // for this channel so the user can pick Sync now / Settings first / Not now.
  bot.action(/^main_menu:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    const chatId = ctx.chat?.id;
    const lang = ctx.from?.language_code;
    const l = t(lang);
    await ctx.answerCbQuery();
    if (!chatId) return;

    const session = config.getSession(chatId);
    if (!session) {
      await ctx.editMessageText(l.settingsSessionExpired);
      return;
    }
    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText(l.settingsChannelNotFound);
      return;
    }

    // Resolve workspace name for nicer messaging; fall back to ID on failure.
    let workspaceName = session.workspaceId;
    try {
      const client = new CrmChatClient(session.apiKey);
      const workspaces = await client.listWorkspaces(session.organizationId);
      const ws = workspaces.find((w) => w.id === session.workspaceId);
      if (ws) workspaceName = ws.name;
    } catch {
      // keep fallback
    }

    await ctx.editMessageText(
      l.promotedWithSession(ch.channelTitle, workspaceName),
      {
        ...Markup.inlineKeyboard([
          Markup.button.callback(l.syncNowBtn, `sync_now:${channelId}`),
          Markup.button.callback(l.settingsFirstBtn, `settings_first:${channelId}`),
          Markup.button.callback(l.notNowBtn, `not_now:${channelId}`),
        ]),
      },
    );
  });

  // "Back" -> go back to channel list
  bot.action("settings_back", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const lang = ctx.from?.language_code;
    const l = t(lang);
    await ctx.answerCbQuery();

    const session = config.getSession(chatId);
    if (!session) {
      await ctx.editMessageText(l.settingsSessionExpired);
      return;
    }

    const channels = config.getChannelsByWorkspace(session.workspaceId);
    if (channels.length === 0) {
      await ctx.editMessageText(l.settingsNoChannelsConfigured);
      return;
    }

    const buttons = channels.map((ch) =>
      Markup.button.callback(
        ch.channelTitle,
        `settings_channel:${ch.channelId}`,
      ),
    );

    await ctx.editMessageText(l.settingsChooseChannel, {
      ...Markup.inlineKeyboard(buttons, { columns: 2 }),
    });
  });

  // "Remove mapping" -> clear property mapping
  bot.action(/^remove_mapping:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    const lang = ctx.from?.language_code;
    const l = t(lang);
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText(l.settingsChannelNotFound);
      return;
    }

    const updated: ChannelConfig = { ...ch, propertyMapping: undefined };
    config.setChannelConfig(channelId, updated);

    await ctx.editMessageText(formatChannelSettings(updated, l), {
      ...channelSettingsKeyboard(channelId, l),
    });
  });

  // "Set property mapping" -> fetch properties from CRM API
  bot.action(/^set_mapping:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    const lang = ctx.from?.language_code;
    const l = t(lang);
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText(l.settingsChannelNotFound);
      return;
    }

    let properties: Property[];
    try {
      const client = new CrmChatClient(ch.apiKey);
      properties = await client.listProperties(ch.workspaceId);
    } catch {
      await ctx.editMessageText(
        l.settingsCouldNotLoadProps,
        { ...channelSettingsKeyboard(channelId, l) },
      );
      return;
    }

    const configurable = properties.filter(isConfigurableProperty);
    if (configurable.length === 0) {
      await ctx.editMessageText(
        l.settingsNoConfigurableProps,
        { ...channelSettingsKeyboard(channelId, l) },
      );
      return;
    }

    const buttons = configurable.map((prop) =>
      Markup.button.callback(
        prop.name,
        `select_prop:${channelId}:${prop.key}`,
      ),
    );
    buttons.push(
      Markup.button.callback(l.settingsBtnCancel, `settings_channel:${channelId}`),
    );

    await ctx.editMessageText(
      l.settingsSelectProperty,
      { ...Markup.inlineKeyboard(buttons, { columns: 2 }) },
    );
  });

  // User picks a property -> show options for join value
  bot.action(/^select_prop:(-?\d+):(.+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    const propKey = ctx.match[2];
    const lang = ctx.from?.language_code;
    const l = t(lang);
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText(l.settingsChannelNotFound);
      return;
    }

    // Fetch properties again to get the options
    let properties: Property[];
    try {
      const client = new CrmChatClient(ch.apiKey);
      properties = await client.listProperties(ch.workspaceId);
    } catch {
      await ctx.editMessageText(
        l.settingsCouldNotLoadProps,
        { ...channelSettingsKeyboard(channelId, l) },
      );
      return;
    }

    const prop = properties.find((p) => p.key === propKey);
    if (!prop) {
      await ctx.editMessageText(l.settingsPropertyNotFound);
      return;
    }

    if (prop.type === "single-select" && prop.options && prop.options.length > 0) {
      // Show options as buttons for join value (use cache to stay within 64-byte limit)
      const buttons = prop.options.map((opt) => {
        const cbKey = storeCallback("jv", {
          channelId: String(channelId),
          propKey,
          propName: prop.name,
          value: opt.value,
          label: opt.label,
        });
        return Markup.button.callback(opt.label, cbKey);
      });
      buttons.push(
        Markup.button.callback(l.settingsBtnCancel, `settings_channel:${channelId}`),
      );

      await ctx.editMessageText(
        l.settingsJoinValuePrompt,
        { ...Markup.inlineKeyboard(buttons, { columns: 2 }) },
      );
    } else {
      // Text property: use state machine for text input
      const chatId = ctx.chat?.id;
      if (!chatId) return;

      textInputStates.set(chatId, {
        phase: "waiting_for_join_value",
        channelId,
        propKey,
        propName: prop.name,
      });

      await ctx.editMessageText(l.settingsJoinTextPrompt);
    }
  });

  // Single-select: user picks join value -> ask for leave value (cached callback)
  bot.action(/^jv:\d+$/, async (ctx) => {
    const data = lookupCallback(ctx.match[0]);
    const lang = ctx.from?.language_code;
    const l = t(lang);
    if (!data) {
      await ctx.answerCbQuery(l.settingsSessionExpiredCb);
      return;
    }

    const channelId = Number(data.channelId);
    const propKey = data.propKey;
    const propName = data.propName;
    const joinValue = data.value;
    const joinLabel = data.label;
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText(l.settingsChannelNotFound);
      return;
    }

    // Fetch properties to get leave options
    let properties: Property[];
    try {
      const client = new CrmChatClient(ch.apiKey);
      properties = await client.listProperties(ch.workspaceId);
    } catch {
      await ctx.editMessageText(
        l.settingsCouldNotLoadProps,
        { ...channelSettingsKeyboard(channelId, l) },
      );
      return;
    }

    const prop = properties.find((p) => p.key === propKey);
    if (!prop || !prop.options) {
      await ctx.editMessageText(l.settingsPropertyNotFound);
      return;
    }

    const buttons = prop.options.map((opt) => {
      const cbKey = storeCallback("lv", {
        channelId: String(channelId),
        propKey,
        propName: propName ?? prop.name,
        joinValue,
        joinLabel: joinLabel ?? joinValue,
        leaveValue: opt.value,
        leaveLabel: opt.label,
      });
      return Markup.button.callback(opt.label, cbKey);
    });
    buttons.push(
      Markup.button.callback(l.settingsBtnCancel, `settings_channel:${channelId}`),
    );

    await ctx.editMessageText(
      l.settingsLeaveValuePrompt,
      { ...Markup.inlineKeyboard(buttons, { columns: 2 }) },
    );
  });

  // Single-select: user picks leave value -> save mapping (cached callback)
  bot.action(/^lv:\d+$/, async (ctx) => {
    const data = lookupCallback(ctx.match[0]);
    const lang = ctx.from?.language_code;
    const l = t(lang);
    if (!data) {
      await ctx.answerCbQuery(l.settingsSessionExpiredCb);
      return;
    }

    const channelId = Number(data.channelId);
    const propKey = data.propKey;
    const propName = data.propName ?? propKey;
    const joinValue = data.joinValue;
    const joinLabel = data.joinLabel ?? joinValue;
    const leaveValue = data.leaveValue;
    const leaveLabel = data.leaveLabel ?? leaveValue;
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText(l.settingsChannelNotFound);
      return;
    }

    const mapping: PropertyMapping = {
      propertyKey: propKey,
      propertyName: propName,
      joinValue,
      joinLabel,
      leaveValue,
      leaveLabel,
    };

    config.setChannelConfig(channelId, { ...ch, propertyMapping: mapping });

    await ctx.editMessageText(
      l.settingsMappingSaved(propName, joinLabel, leaveLabel),
      { ...mappingSavedKeyboard(channelId, l) },
    );
  });

  // Text input handler for text-type properties (join and leave values)
  bot.on("text", async (ctx, next) => {
    const chatId = ctx.chat.id;
    const state = textInputStates.get(chatId);
    if (!state) return next(); // not in text input flow, pass to next handler

    const text = ctx.message.text.trim();
    if (!text) return;

    const lang = ctx.from?.language_code;
    const l = t(lang);

    if (state.phase === "waiting_for_join_value") {
      // Store join value, ask for leave value
      state.joinValue = text;
      state.phase = "waiting_for_leave_value";
      textInputStates.set(chatId, state);

      await ctx.reply(l.settingsLeaveTextPrompt);
    } else if (state.phase === "waiting_for_leave_value") {
      // Save the mapping
      const ch = config.getChannelConfig(state.channelId);
      if (!ch) {
        textInputStates.delete(chatId);
        await ctx.reply(l.settingsChannelNotFound);
        return;
      }

      const mapping: PropertyMapping = {
        propertyKey: state.propKey,
        propertyName: state.propName,
        joinValue: state.joinValue!,
        joinLabel: state.joinValue!,    // for text props, value IS the label
        leaveValue: text,
        leaveLabel: text,
      };

      config.setChannelConfig(state.channelId, {
        ...ch,
        propertyMapping: mapping,
      });

      textInputStates.delete(chatId);

      await ctx.reply(
        l.settingsMappingSaved(state.propName, state.joinValue!, text),
        { ...mappingSavedKeyboard(state.channelId, l) },
      );
    }
  });
}
