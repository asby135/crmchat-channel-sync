import { Markup, type Telegraf } from "telegraf";
import { CrmChatClient } from "../api/client.js";
import type { Property } from "../api/types.js";
import type { ConfigStore } from "../config/store.js";
import type { ChannelConfig, PropertyMapping } from "../config/types.js";

// ── Callback data cache (Telegram 64-byte limit workaround) ────────

let callbackSeq = 0;
const callbackCache = new Map<string, Record<string, string>>();

function storeCallback(prefix: string, data: Record<string, string>): string {
  const key = `${prefix}:${++callbackSeq}`;
  callbackCache.set(key, data);
  return key;
}

function lookupCallback(key: string): Record<string, string> | undefined {
  return callbackCache.get(key);
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

function formatChannelSettings(ch: ChannelConfig): string {
  const mapping = ch.propertyMapping;
  const lines = [
    `Settings for ${ch.channelTitle}:`,
    "",
    `Property mapping: ${mapping ? mapping.propertyKey : "not set"}`,
    `Join value: ${mapping?.joinValue ?? "\u2014"}`,
    `Leave value: ${mapping?.leaveValue ?? "\u2014"}`,
    `Last sync: ${ch.lastSyncAt ?? "never"}`,
    `Subscribers: ${ch.subscriberCount ?? "unknown"}`,
  ];
  return lines.join("\n");
}

function channelSettingsKeyboard(channelId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Set property mapping", `set_mapping:${channelId}`),
      Markup.button.callback("Remove mapping", `remove_mapping:${channelId}`),
    ],
    [Markup.button.callback("Back", "settings_back")],
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
    const session = config.getSession(chatId);

    if (!session) {
      await ctx.reply(
        "You need to connect first. Send /start to set up your CRMChat API key.",
      );
      return;
    }

    const channels = config.getChannelsByWorkspace(session.workspaceId);
    if (channels.length === 0) {
      await ctx.reply(
        "No channels configured yet. Add me as admin to a channel or group first.",
      );
      return;
    }

    const buttons = channels.map((ch) =>
      Markup.button.callback(
        ch.channelTitle,
        `settings_channel:${ch.channelId}`,
      ),
    );

    await ctx.reply("Choose a channel to configure:", {
      ...Markup.inlineKeyboard(buttons, { columns: 2 }),
    });
  });

  // Step 3: user picks a channel -> show settings
  bot.action(/^settings_channel:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText("Channel not found. Try /settings again.");
      return;
    }

    await ctx.editMessageText(formatChannelSettings(ch), {
      ...channelSettingsKeyboard(channelId),
    });
  });

  // "Back" -> go back to channel list
  bot.action("settings_back", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    await ctx.answerCbQuery();

    const session = config.getSession(chatId);
    if (!session) {
      await ctx.editMessageText("Session expired. Send /start to reconnect.");
      return;
    }

    const channels = config.getChannelsByWorkspace(session.workspaceId);
    if (channels.length === 0) {
      await ctx.editMessageText("No channels configured.");
      return;
    }

    const buttons = channels.map((ch) =>
      Markup.button.callback(
        ch.channelTitle,
        `settings_channel:${ch.channelId}`,
      ),
    );

    await ctx.editMessageText("Choose a channel to configure:", {
      ...Markup.inlineKeyboard(buttons, { columns: 2 }),
    });
  });

  // "Remove mapping" -> clear property mapping
  bot.action(/^remove_mapping:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText("Channel not found. Try /settings again.");
      return;
    }

    const updated: ChannelConfig = { ...ch, propertyMapping: undefined };
    config.setChannelConfig(channelId, updated);

    await ctx.editMessageText(formatChannelSettings(updated), {
      ...channelSettingsKeyboard(channelId),
    });
  });

  // "Set property mapping" -> fetch properties from CRM API
  bot.action(/^set_mapping:(-?\d+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText("Channel not found. Try /settings again.");
      return;
    }

    let properties: Property[];
    try {
      const client = new CrmChatClient(ch.apiKey);
      properties = await client.listProperties(ch.workspaceId);
    } catch {
      await ctx.editMessageText(
        "Could not load properties. Try again later.",
        { ...channelSettingsKeyboard(channelId) },
      );
      return;
    }

    const configurable = properties.filter(isConfigurableProperty);
    if (configurable.length === 0) {
      await ctx.editMessageText(
        "No configurable properties found. Create a custom single-select or text property in CRMChat first.",
        { ...channelSettingsKeyboard(channelId) },
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
      Markup.button.callback("Cancel", `settings_channel:${channelId}`),
    );

    await ctx.editMessageText(
      "Select the property to use for join/leave tracking:",
      { ...Markup.inlineKeyboard(buttons, { columns: 2 }) },
    );
  });

  // User picks a property -> show options for join value
  bot.action(/^select_prop:(-?\d+):(.+)$/, async (ctx) => {
    const channelId = Number(ctx.match[1]);
    const propKey = ctx.match[2];
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText("Channel not found. Try /settings again.");
      return;
    }

    // Fetch properties again to get the options
    let properties: Property[];
    try {
      const client = new CrmChatClient(ch.apiKey);
      properties = await client.listProperties(ch.workspaceId);
    } catch {
      await ctx.editMessageText(
        "Could not load properties. Try again later.",
        { ...channelSettingsKeyboard(channelId) },
      );
      return;
    }

    const prop = properties.find((p) => p.key === propKey);
    if (!prop) {
      await ctx.editMessageText("Property not found. Try again.");
      return;
    }

    if (prop.type === "single-select" && prop.options && prop.options.length > 0) {
      // Show options as buttons for join value (use cache to stay within 64-byte limit)
      const buttons = prop.options.map((opt) => {
        const cbKey = storeCallback("jv", {
          channelId: String(channelId),
          propKey,
          value: opt.value,
        });
        return Markup.button.callback(opt.label, cbKey);
      });
      buttons.push(
        Markup.button.callback("Cancel", `settings_channel:${channelId}`),
      );

      await ctx.editMessageText(
        "What value when someone JOINS?",
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

      await ctx.editMessageText(
        "Type the value to set when someone JOINS this channel:",
      );
    }
  });

  // Single-select: user picks join value -> ask for leave value (cached callback)
  bot.action(/^jv:\d+$/, async (ctx) => {
    const data = lookupCallback(ctx.match[0]);
    if (!data) {
      await ctx.answerCbQuery("Session expired. Try /settings again.");
      return;
    }

    const channelId = Number(data.channelId);
    const propKey = data.propKey;
    const joinValue = data.value;
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText("Channel not found. Try /settings again.");
      return;
    }

    // Fetch properties to get leave options
    let properties: Property[];
    try {
      const client = new CrmChatClient(ch.apiKey);
      properties = await client.listProperties(ch.workspaceId);
    } catch {
      await ctx.editMessageText(
        "Could not load properties. Try again later.",
        { ...channelSettingsKeyboard(channelId) },
      );
      return;
    }

    const prop = properties.find((p) => p.key === propKey);
    if (!prop || !prop.options) {
      await ctx.editMessageText("Property not found. Try again.");
      return;
    }

    const buttons = prop.options.map((opt) => {
      const cbKey = storeCallback("lv", {
        channelId: String(channelId),
        propKey,
        joinValue,
        leaveValue: opt.value,
      });
      return Markup.button.callback(opt.label, cbKey);
    });
    buttons.push(
      Markup.button.callback("Cancel", `settings_channel:${channelId}`),
    );

    await ctx.editMessageText(
      "What value when someone LEAVES?",
      { ...Markup.inlineKeyboard(buttons, { columns: 2 }) },
    );
  });

  // Single-select: user picks leave value -> save mapping (cached callback)
  bot.action(/^lv:\d+$/, async (ctx) => {
    const data = lookupCallback(ctx.match[0]);
    if (!data) {
      await ctx.answerCbQuery("Session expired. Try /settings again.");
      return;
    }

    const channelId = Number(data.channelId);
    const propKey = data.propKey;
    const joinValue = data.joinValue;
    const leaveValue = data.leaveValue;
    await ctx.answerCbQuery();

    const ch = config.getChannelConfig(channelId);
    if (!ch) {
      await ctx.editMessageText("Channel not found. Try /settings again.");
      return;
    }

    const mapping: PropertyMapping = {
      propertyKey: propKey,
      joinValue,
      leaveValue,
    };

    config.setChannelConfig(channelId, { ...ch, propertyMapping: mapping });

    await ctx.editMessageText(
      `Property mapping saved! Join = ${propKey}: ${joinValue}, Leave = ${propKey}: ${leaveValue}`,
      { ...channelSettingsKeyboard(channelId) },
    );
  });

  // Text input handler for text-type properties (join and leave values)
  bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    const state = textInputStates.get(chatId);
    if (!state) return; // not in text input flow

    const text = ctx.message.text.trim();
    if (!text) return;

    if (state.phase === "waiting_for_join_value") {
      // Store join value, ask for leave value
      state.joinValue = text;
      state.phase = "waiting_for_leave_value";
      textInputStates.set(chatId, state);

      await ctx.reply(
        "Type the value to set when someone LEAVES this channel:",
      );
    } else if (state.phase === "waiting_for_leave_value") {
      // Save the mapping
      const ch = config.getChannelConfig(state.channelId);
      if (!ch) {
        textInputStates.delete(chatId);
        await ctx.reply("Channel not found. Try /settings again.");
        return;
      }

      const mapping: PropertyMapping = {
        propertyKey: state.propKey,
        joinValue: state.joinValue!,
        leaveValue: text,
      };

      config.setChannelConfig(state.channelId, {
        ...ch,
        propertyMapping: mapping,
      });

      textInputStates.delete(chatId);

      await ctx.reply(
        `Property mapping saved! Join = ${state.propKey}: ${state.joinValue}, Leave = ${state.propKey}: ${text}`,
      );
    }
  });
}
