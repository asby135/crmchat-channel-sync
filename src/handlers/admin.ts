import type { Telegraf } from "telegraf";
import type { ConfigStore } from "../config/store.js";
import type { StatEvent } from "../config/types.js";

/** Parse a comma/space-separated list of Telegram user IDs into a Set. */
export function parseAdminIds(raw: string | undefined): Set<number> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
}

const STAGE_LABELS: Record<StatEvent, string> = {
  bot_started: "Bot started",
  workspace_connected: "Workspace connected",
  channel_connected: "Channel connected",
  sync_completed: "Sync completed",
};

const STAGE_ORDER: StatEvent[] = [
  "bot_started",
  "workspace_connected",
  "channel_connected",
  "sync_completed",
];

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

/** Format a 4-stage funnel as a monospace table. */
export function formatAdminStats(
  week: Record<StatEvent, number>,
  month: Record<StatEvent, number>,
): string {
  const labelW = Math.max(...STAGE_ORDER.map((s) => STAGE_LABELS[s].length));
  const lines: string[] = [];
  lines.push("📊 <b>Admin stats</b>");
  lines.push("");
  lines.push("<pre>");
  lines.push(
    `${"Stage".padEnd(labelW)}   ${"7d".padStart(6)}  ${"%".padStart(5)}   ${"30d".padStart(6)}  ${"%".padStart(5)}`,
  );
  lines.push("─".repeat(labelW + 30));
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    const stage = STAGE_ORDER[i];
    const wk = week[stage];
    const mo = month[stage];
    const wkPct = i === 0 ? "" : pct(wk, week[STAGE_ORDER[i - 1]]);
    const moPct = i === 0 ? "" : pct(mo, month[STAGE_ORDER[i - 1]]);
    lines.push(
      `${STAGE_LABELS[stage].padEnd(labelW)}   ${String(wk).padStart(6)}  ${wkPct.padStart(5)}   ${String(mo).padStart(6)}  ${moPct.padStart(5)}`,
    );
  }
  lines.push("</pre>");
  lines.push("");
  lines.push("<i>% = conversion from previous stage. Counters bucketed by UTC day.</i>");
  return lines.join("\n");
}

export function registerAdminHandler(bot: Telegraf, config: ConfigStore): void {
  const adminIds = parseAdminIds(process.env.ADMIN_TELEGRAM_IDS);

  bot.command("admin", async (ctx) => {
    const userId = ctx.from?.id;
    // Silently ignore non-admins so we don't leak the command's existence.
    if (!userId || !adminIds.has(userId)) return;

    const week = config.rollupStats(7);
    const month = config.rollupStats(30);
    await ctx.reply(formatAdminStats(week, month));
  });
}
