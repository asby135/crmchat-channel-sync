import { Markup, type Telegraf } from "telegraf";
import { CrmChatClient, ApiAuthError } from "../api/client.js";
import type { ConfigStore } from "../config/store.js";
import { isInTextInputFlow } from "./settings.js";
import { t } from "../i18n/index.js";

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
    orgs = await client.listOrganizations();
  } catch (err) {
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
  } catch (err) {
    return { error: "Could not reach CRMChat API. Please try again." };
  }

  if (!workspaces.length) {
    return { error: "No workspaces found for this organization." };
  }

  const workspace = workspaces[0];
  console.log("[start] Session created for workspace:", workspace.name);

  config.setSession(chatId, {
    apiKey,
    workspaceId: workspace.id,
    organizationId: org.id,
    authenticatedAt: new Date().toISOString(),
  });

  return { workspaceName: workspace.name };
}

// ── Localized error mapping ─────────────────────────────────────────

function localizeError(error: string, lang: string | undefined): string {
  const l = t(lang);
  const map: Record<string, string> = {
    "Invalid API key. Check Settings > API Keys in CRMChat.": l.invalidApiKey,
    "Could not reach CRMChat API. Please try again.": l.apiUnreachable,
    "No organizations found for this API key.": l.noOrganizations,
    "No workspaces found for this organization.": l.noWorkspaces,
  };
  return map[error] ?? error;
}

// ── Handler registration ─────────────────────────────────────────────

export function registerStartHandler(bot: Telegraf, config: ConfigStore): void {
  // /start command (with or without deep-link payload)
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const payload = ctx.startPayload?.trim();
    const lang = ctx.from?.language_code;
    const l = t(lang);

    // Flow A: deep link with API key
    if (payload && payload.startsWith("sk_")) {
      const result = await validateAndCreateSession(payload, config, chatId);
      if ("workspaceName" in result) {
        await ctx.reply(l.connectedToWorkspace(result.workspaceName));
      } else {
        await ctx.reply(localizeError(result.error, lang));
      }
      return;
    }

    // Flow B: no deep link
    const session = config.getSession(chatId);
    if (session) {
      await ctx.reply(l.alreadyConnected(session.workspaceId), {
        ...Markup.inlineKeyboard([
          Markup.button.callback(l.switchWorkspaceBtn, "switch_workspace"),
        ]),
      });
    } else {
      await ctx.reply(l.welcome);
    }
  });

  // Switch workspace callback
  bot.action("switch_workspace", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const lang = ctx.from?.language_code;
    const l = t(lang);

    await ctx.answerCbQuery();
    config.removeSession(chatId);
    await ctx.editMessageText(l.switchWorkspaceMsg);
  });

  // Text handler: capture API key input (must call next() for non-matching messages)
  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (!text.startsWith("sk_")) return next();

    // Don't intercept if user is in a settings text-input flow
    if (isInTextInputFlow(ctx.chat.id)) return next();

    const chatId = ctx.chat.id;
    const lang = ctx.from?.language_code;
    const l = t(lang);
    const result = await validateAndCreateSession(text, config, chatId);
    if ("workspaceName" in result) {
      await ctx.reply(l.connectedToWorkspace(result.workspaceName));
    } else {
      await ctx.reply(localizeError(result.error, lang));
    }
  });
}
