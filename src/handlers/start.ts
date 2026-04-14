import { Markup, type Telegraf } from "telegraf";
import { CrmChatClient, ApiAuthError } from "../api/client.js";
import type { Workspace } from "../api/types.js";
import type { ConfigStore } from "../config/store.js";
import { isInTextInputFlow } from "./settings.js";
import { t } from "../i18n/index.js";

// ── Pending API key cache (for workspace picker flow) ───────────────

const pendingApiKeys = new Map<number, string>();

// ── Exported helper (testable without Telegraf context) ──────────────

export async function validateApiKey(
  apiKey: string,
): Promise<{ workspaces: Workspace[] } | { error: string }> {
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

  // Aggregate workspaces across ALL organizations the API key can see.
  // Picking only orgs[0] hid workspaces in newly-created orgs (bug: bot
  // silently auto-selected the wrong workspace instead of showing a picker).
  const workspaces: Workspace[] = [];
  try {
    const perOrg = await Promise.all(orgs.map((o) => client.listWorkspaces(o.id)));
    for (const list of perOrg) workspaces.push(...list);
  } catch {
    return { error: "Could not reach CRMChat API. Please try again." };
  }

  if (!workspaces.length) {
    return { error: "No workspaces found for this organization." };
  }

  return { workspaces };
}

/** Create session for a specific workspace (used after picker or single-workspace auto-select) */
export function createSession(
  config: ConfigStore,
  chatId: number,
  apiKey: string,
  workspace: Workspace,
  organizationId: string,
): void {
  config.setSession(chatId, {
    apiKey,
    workspaceId: workspace.id,
    organizationId,
    authenticatedAt: new Date().toISOString(),
  });
  console.log("[start] Session created for workspace:", workspace.name);
}

// Keep backward compat for tests
export async function validateAndCreateSession(
  apiKey: string,
  config: ConfigStore,
  chatId: number,
): Promise<{ workspaceName: string } | { error: string }> {
  const result = await validateApiKey(apiKey);
  if ("error" in result) return result;

  const workspace = result.workspaces[0];
  createSession(config, chatId, apiKey, workspace, workspace.organizationId);
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

  /** Shared logic for handling an API key (deep link or text input) */
  async function handleApiKey(
    apiKey: string,
    chatId: number,
    lang: string | undefined,
    reply: (text: string, extra?: object) => Promise<unknown>,
  ) {
    const l = t(lang);
    const result = await validateApiKey(apiKey);

    if ("error" in result) {
      await reply(localizeError(result.error, lang));
      return;
    }

    // Always show the picker with ALL workspaces across every org the API
    // key can see, even when there's only one. The user asked to confirm
    // the target workspace explicitly so the bot never silently picks the
    // wrong one.
    pendingApiKeys.set(chatId, apiKey);
    const buttons = result.workspaces.map((ws) =>
      Markup.button.callback(ws.name, `pick_ws:${ws.id}:${ws.organizationId}`),
    );
    await reply(l.pickWorkspace, {
      ...Markup.inlineKeyboard(buttons, { columns: 1 }),
    });
  }

  // /start command (with or without deep-link payload)
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const payload = ctx.startPayload?.trim();
    const lang = ctx.from?.language_code;
    const l = t(lang);

    // Flow A: deep link with API key
    if (payload && payload.startsWith("sk_")) {
      await handleApiKey(payload, chatId, lang, (text, extra) => ctx.reply(text, extra));
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

  // Workspace picker callback
  bot.action(/^pick_ws:(.+):(.+)$/, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const lang = ctx.from?.language_code;
    const l = t(lang);

    const workspaceId = ctx.match[1];
    const organizationId = ctx.match[2];
    const apiKey = pendingApiKeys.get(chatId);

    await ctx.answerCbQuery();

    if (!apiKey) {
      await ctx.editMessageText(l.settingsSessionExpired);
      return;
    }

    pendingApiKeys.delete(chatId);

    // Fetch workspace name
    try {
      const client = new CrmChatClient(apiKey);
      const workspaces = await client.listWorkspaces(organizationId);
      const ws = workspaces.find((w) => w.id === workspaceId);
      if (!ws) {
        await ctx.editMessageText(l.noWorkspaces);
        return;
      }
      createSession(config, chatId, apiKey, ws, organizationId);
      await ctx.editMessageText(l.connectedToWorkspace(ws.name));
    } catch {
      await ctx.editMessageText(l.apiUnreachable);
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
    await handleApiKey(text, chatId, lang, (t, extra) => ctx.reply(t, extra));
  });
}
