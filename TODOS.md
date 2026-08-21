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

## P1: Fix ownerId validation order in CRM API contact create
- **What:** In `apps/backend/src/api/routers/contacts.ts`, `validateContactProperties()` create-mode injects `data[prop.key] = null` for every required property missing from the body — including `ownerId`. Validation then rejects the null as "Property is required", even though the handler applies `body.ownerId ?? context.user.id` 100 lines later. Fix: exclude server-defaulted properties from the null injection (or seed `ownerId` with the context user before validating).
- **Why:** Any workspace that marks the Owner contact property required 400s on every contact create, for every API client — the channel-parser bot, Zapier, dashboard bulk import. Hit in production 2026-08-20 across Dennis | Market Mastery, VolleyFamily, KRYPTO XY.
- **Effort:** S (human: ~1 hour / CC: ~10 min)
- **Repo:** `CRMChat Main/crm` (not this one)
- **Context:** The bot ships a workaround in `src/lib/resolve-owner.ts` that sends an explicit ownerId picked from workspace members. That workaround can be deleted once the API validates before applying its own defaults. The bot cannot reproduce the API's intended default (owner = authenticated user) because there is still no `/me` endpoint for API-key clients.
