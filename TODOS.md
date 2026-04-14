# TODOS

## P3: Full dashboard settings page for Channel / Chat Sync
- **What:** Build a dedicated settings page in CRMChat dashboard with channel list, property mapping UI, sync status widget, and inline channel config expansion.
- **Why:** Moves channel management from Telegram bot UI to the dashboard for a more integrated experience. Design spec is complete (wireframe, interaction states, responsive, a11y) in the CEO plan file.
- **Effort:** M (human: ~2 days / CC: ~30 min)
- **Depends on:** Config migration from local JSON to CRM API storage (new `/channel-sync-configs` endpoint needed)
- **Context:** Full design review completed 2026-04-11. Wireframe, component mapping, interaction state table, and responsive specs in `~/.gstack/projects/asby135-crmchat-channel-sync/ceo-plans/2026-04-10-channel-parser-bot.md`. Deferred because all config currently works through the Telegram bot's /settings command, and adding a dashboard page requires API-backed config storage.

## P2: Auth code flow for deep links
- **What:** Upgrade API key auth to short-lived auth codes (5-min expiry, one-time use)
- **Why:** API keys exposed in Telegram chat history when using deep links. Auth codes eliminate credential exposure.
- **Effort:** M (human: ~2 days / CC: ~20 min)
- **Depends on:** CRMChat dashboard integration (Phase 2)
- **Context:** Currently accepted risk for MVP. Should ship before broad user rollout. Requires new CRMChat API endpoint for code generation + exchange.
