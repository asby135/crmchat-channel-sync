# TODOS

## P2: Auth code flow for deep links
- **What:** Upgrade API key auth to short-lived auth codes (5-min expiry, one-time use)
- **Why:** API keys exposed in Telegram chat history when using deep links. Auth codes eliminate credential exposure.
- **Effort:** M (human: ~2 days / CC: ~20 min)
- **Depends on:** CRMChat dashboard integration (Phase 2)
- **Context:** Currently accepted risk for MVP. Should ship before broad user rollout. Requires new CRMChat API endpoint for code generation + exchange.
