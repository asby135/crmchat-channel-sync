import "dotenv/config";
import { Telegraf } from "telegraf";
import { ConfigStore } from "./config/store.js";
import { registerStartHandler } from "./handlers/start.js";
import { registerSyncHandler } from "./handlers/sync.js";
import { registerSettingsHandler } from "./handlers/settings.js";
import { registerMyChatMemberListener } from "./listeners/my-chat-member.js";
import { registerChatMemberListener } from "./listeners/chat-member.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN required");

const bot = new Telegraf(token, {
  telegram: { webhookReply: false },
});

// Default parse_mode: "HTML" for all outgoing text messages
bot.use((ctx, next) => {
  const tg = ctx.telegram;
  const origSend = tg.sendMessage.bind(tg);
  tg.sendMessage = ((chatId: number | string, text: string, extra?: object) =>
    origSend(chatId, text, { parse_mode: "HTML", ...extra })) as typeof tg.sendMessage;

  const origEdit = tg.editMessageText.bind(tg);
  tg.editMessageText = ((
    chatId: number | string | undefined,
    messageId: number | undefined,
    inlineMessageId: string | undefined,
    text: string,
    extra?: object,
  ) =>
    origEdit(chatId, messageId, inlineMessageId, text, {
      parse_mode: "HTML",
      ...extra,
    })) as typeof tg.editMessageText;

  return next();
});

const config = new ConfigStore();

async function main() {
  await config.load();

  // Register handlers
  registerStartHandler(bot, config);
  registerSyncHandler(bot, config);
  registerSettingsHandler(bot, config);
  registerMyChatMemberListener(bot, config);
  registerChatMemberListener(bot, config);

  // Register bot commands menu with Telegram
  await bot.telegram.setMyCommands([
    { command: "start", description: "Connect your CRMChat account" },
    { command: "sync", description: "Sync channel subscribers" },
    { command: "settings", description: "Configure property mappings" },
  ]);

  console.log("Channel Parser Bot starting...");
  await bot.launch({
    allowedUpdates: [
      "message",
      "callback_query",
      "my_chat_member",
      "chat_member",
    ],
  });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch(console.error);
