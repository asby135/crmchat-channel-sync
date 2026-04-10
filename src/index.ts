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

const bot = new Telegraf(token);
const config = new ConfigStore();

async function main() {
  await config.load();

  // Register handlers, passing config as dependency
  registerStartHandler(bot, config);
  registerSyncHandler(bot, config);
  registerSettingsHandler(bot, config);
  registerMyChatMemberListener(bot, config);
  registerChatMemberListener(bot, config);

  console.log("Channel Parser Bot starting...");
  await bot.launch();

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch(console.error);
