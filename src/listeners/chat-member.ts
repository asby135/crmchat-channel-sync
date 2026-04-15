import type { Telegraf } from "telegraf";
import { CrmChatClient, ApiAuthError } from "../api/client.js";
import type { CreateContactInput } from "../api/types.js";
import type { ConfigStore } from "../config/store.js";
import type { PropertyMapping } from "../config/types.js";
import { buildFullName } from "../handlers/sync.js";
import { sleep } from "../lib/rate-limiter.js";

// ── Exported helper (testable without Telegraf context) ──────────────

export function classifyChatMemberChange(
  oldStatus: string,
  newStatus: string,
): "joined" | "left" | "ignore" {
  const joinFromStatuses = ["left", "kicked", "restricted"];
  const joinToStatuses = ["member", "administrator", "creator"];
  const leaveFromStatuses = ["member", "administrator", "creator"];
  const leaveToStatuses = ["left", "kicked"];

  if (joinFromStatuses.includes(oldStatus) && joinToStatuses.includes(newStatus)) {
    return "joined";
  }

  if (leaveFromStatuses.includes(oldStatus) && leaveToStatuses.includes(newStatus)) {
    return "left";
  }

  return "ignore";
}

// ── Listener registration ────────────────────────────────────────────

export function registerChatMemberListener(
  bot: Telegraf,
  config: ConfigStore,
): void {
  bot.on("chat_member", async (ctx) => {
    const { old_chat_member, new_chat_member, chat } = ctx.chatMember;
    const oldStatus = old_chat_member.status;
    const newStatus = new_chat_member.status;

    const action = classifyChatMemberChange(oldStatus, newStatus);
    if (action === "ignore") return;

    const channelId = chat.id;
    const channelTitle = "title" in chat ? chat.title : `Chat ${channelId}`;
    const channelConfig = config.getChannelConfig(channelId);
    if (!channelConfig) return; // channel not tracked

    const user = new_chat_member.user;

    // Skip bots
    if (user.is_bot) return;

    const client = new CrmChatClient(channelConfig.apiKey);
    const { workspaceId, propertyMapping } = channelConfig;

    try {
      if (action === "joined") {
        await handleJoin(client, workspaceId, user, propertyMapping, channelTitle);
      } else {
        await handleLeave(client, workspaceId, user, propertyMapping, channelTitle);
      }
    } catch (err) {
      if (err instanceof ApiAuthError) {
        console.warn(
          `[chat_member] Auth error (401) for channel ${channelId}: API key may be expired`,
        );
      } else {
        console.error(
          `[chat_member] Error processing ${action} for user ${user.id} in ${channelTitle}:`,
          err,
        );
      }
    }
  });
}

// ── Internal handlers ────────────────────────────────────────────────

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

/**
 * Create a CRM contact for a Telegram user, filling required custom property
 * defaults and setting the tracked property to `mappedValue` (join or leave
 * value) when a mapping is configured. Returns the full name used, for logging.
 */
async function createContactForUser(
  client: CrmChatClient,
  workspaceId: string,
  user: TelegramUser,
  propertyMapping: PropertyMapping | undefined,
  mappedValue: string | undefined,
): Promise<string> {
  const properties = await client.listProperties(workspaceId);
  const customDefaults: Record<string, string> = {};
  for (const prop of properties) {
    if (prop.required && prop.key.startsWith("custom.")) {
      const shortKey = prop.key.replace(/^custom\./, "");
      const defaultVal = prop.options?.[0]?.value ?? "";
      if (defaultVal) customDefaults[shortKey] = defaultVal;
    }
  }

  const fullName = buildFullName(user.first_name, user.last_name, user.id);
  const input: CreateContactInput = {
    fullName,
    telegram: {
      id: user.id,
      username: user.username || undefined,
    },
  };

  if (Object.keys(customDefaults).length > 0 || (propertyMapping && mappedValue)) {
    input.custom = { ...customDefaults };
    if (propertyMapping && mappedValue) {
      const key = propertyMapping.propertyKey.replace(/^custom\./, "");
      input.custom[key] = mappedValue;
    }
  }

  await sleep(100);
  await client.createContact(workspaceId, input);
  return fullName;
}

async function handleJoin(
  client: CrmChatClient,
  workspaceId: string,
  user: TelegramUser,
  propertyMapping: PropertyMapping | undefined,
  channelTitle: string,
): Promise<void> {
  // Rate-limit CRM API calls to avoid bursts
  await sleep(100);

  // Check if contact already exists
  const existing = await client.listContacts(workspaceId, {
    filter: { "telegram.id": user.id },
  });

  if (existing.length > 0) {
    // Contact exists; optionally update join property
    if (propertyMapping) {
      const key = propertyMapping.propertyKey.replace(/^custom\./, "");
      await sleep(100);
      await client.updateContact(workspaceId, existing[0].id, {
        custom: { [key]: propertyMapping.joinValue },
      });
    }
    console.log(
      `[chat_member] JOIN (existing) ${channelTitle}: ${user.first_name} (${user.id})`,
    );
    return;
  }

  const fullName = await createContactForUser(
    client,
    workspaceId,
    user,
    propertyMapping,
    propertyMapping?.joinValue,
  );
  console.log(
    `[chat_member] JOIN (created) ${channelTitle}: ${fullName} (${user.id})`,
  );
}

async function handleLeave(
  client: CrmChatClient,
  workspaceId: string,
  user: TelegramUser,
  propertyMapping: PropertyMapping | undefined,
  channelTitle: string,
): Promise<void> {
  await sleep(100);
  const existing = await client.listContacts(workspaceId, {
    filter: { "telegram.id": user.id },
  });

  if (existing.length > 0) {
    if (propertyMapping) {
      const key = propertyMapping.propertyKey.replace(/^custom\./, "");
      await sleep(100);
      await client.updateContact(workspaceId, existing[0].id, {
        custom: { [key]: propertyMapping.leaveValue },
      });
    }
    console.log(
      `[chat_member] LEAVE ${channelTitle}: ${user.first_name} (${user.id})`,
    );
    return;
  }

  // No prior contact — initial sync was never run. Create the contact now
  // with the leave value so subscribers who churn before the first /sync
  // still land in CRM (and are tagged as "left" rather than silently dropped).
  const fullName = await createContactForUser(
    client,
    workspaceId,
    user,
    propertyMapping,
    propertyMapping?.leaveValue,
  );
  console.log(
    `[chat_member] LEAVE (created) ${channelTitle}: ${fullName} (${user.id})`,
  );
}
