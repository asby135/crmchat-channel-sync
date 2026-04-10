import type { Telegraf } from "telegraf";
import { CrmChatClient, ApiAuthError } from "../api/client.js";
import type { ConfigStore } from "../config/store.js";
import { isInTextInputFlow } from "./settings.js";

// ── Exported helper (testable without Telegraf context) ──────────────

export async function validateAndCreateSession(
  apiKey: string,
  config: ConfigStore,
  chatId: number,
): Promise<{ workspaceName: string } | { error: string }> {
  let client: CrmChatClient;
  try {
    client = new CrmChatClient(apiKey);
  } catch {
    return { error: "Invalid API key. Check Settings > API Keys in CRMChat." };
  }

  let orgs;
  try {
    console.log("[start] Validating API key against CRMChat API...");
    orgs = await client.listOrganizations();
    console.log("[start] API responded, orgs:", orgs.length);
  } catch (err) {
    console.log("[start] API call failed:", String(err));
    if (err instanceof ApiAuthError) {
      return { error: "Invalid API key. Check Settings > API Keys in CRMChat." };
    }
    return { error: "Could not reach CRMChat API. Please try again." };
  }

  if (!orgs.length) {
    return { error: "No organizations found for this API key." };
  }

  const org = orgs[0];
  let workspaces;
  try {
    workspaces = await client.listWorkspaces(org.id);
  } catch {
    return { error: "Could not reach CRMChat API. Please try again." };
  }

  if (!workspaces.length) {
    return { error: "No workspaces found for this organization." };
  }

  const workspace = workspaces[0];

  config.setSession(chatId, {
    apiKey,
    workspaceId: workspace.id,
    organizationId: org.id,
    authenticatedAt: new Date().toISOString(),
  });

  return { workspaceName: workspace.name };
}

// ── Handler registration ─────────────────────────────────────────────

export function registerStartHandler(bot: Telegraf, config: ConfigStore): void {
  // /start command (with or without deep-link payload)
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const payload = ctx.startPayload?.trim();

    // Flow A: deep link with API key
    if (payload && payload.startsWith("sk_")) {
      const result = await validateAndCreateSession(payload, config, chatId);
      if ("workspaceName" in result) {
        await ctx.reply(
          `Connected to workspace: ${result.workspaceName}! Now add me as admin to channels you want to sync.`,
        );
      } else {
        await ctx.reply(result.error);
      }
      return;
    }

    // Flow B: no deep link
    const session = config.getSession(chatId);
    if (session) {
      await ctx.reply(
        `You're connected to workspace: ${session.workspaceId}. Use /sync to sync a channel.`,
      );
    } else {
      await ctx.reply(
        "Welcome! Send me your CRMChat API key to get started. Find it in Settings > API Keys.",
      );
    }
  });

  // Text handler: capture API key input
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text.startsWith("sk_")) return;

    // Don't intercept if user is in a settings text-input flow
    if (isInTextInputFlow(ctx.chat.id)) return;

    const chatId = ctx.chat.id;
    const result = await validateAndCreateSession(text, config, chatId);
    if ("workspaceName" in result) {
      await ctx.reply(
        `Connected to workspace: ${result.workspaceName}! Now add me as admin to channels you want to sync.`,
      );
    } else {
      await ctx.reply(result.error);
    }
  });
}
