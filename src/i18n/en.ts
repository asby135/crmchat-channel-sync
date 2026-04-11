export const en = {
  // ── start.ts ──────────────────────────────────────────────────────
  welcome:
    "Hey! 👋\n\nSend me your CRMChat API key to get started.\n\nFind it in *Settings > API Keys* in @crmchat_crm_bot.",

  connectedToWorkspace: (name: string) =>
    `✅ Connected to ${name}!\n\nNow add me as admin to the channels or groups you want to sync.`,

  alreadyConnected: (workspaceId: string) =>
    `You're already connected to workspace ${workspaceId}.\n\nUse /sync to sync a channel, or configure custom properties first in /settings.`,

  invalidApiKey: "❌ Invalid API key.\n\nDouble-check in *Settings > API Keys* in @crmchat_crm_bot.",
  apiUnreachable: "⚠️ Couldn't reach CRMChat API. Please try again in a moment.",
  noOrganizations: "No organizations found for this API key.",
  noWorkspaces: "No workspaces found for this organization.",

  // ── sync.ts ───────────────────────────────────────────────────────
  syncNeedConnect:
    "You need to connect first.\n\nSend /start to set up your API key.",

  syncNoChannels:
    "No channels connected yet.\n\nAdd me as admin to a Telegram channel or group — I'll appear here automatically.",

  syncPickChannel: "Which channel would you like to sync?",

  syncChannelNotFound: "Channel not found. Try /sync again.",

  syncFailed: (title: string, reason: string) =>
    `❌ Sync failed for ${title}.\n\n${reason}`,

  syncProgress: (title: string, synced: number | string, total: number | string, bar: string) =>
    `Syncing ${title}...\n${synced}/${total} subscribers synced ${bar}`,

  syncProgressShort: (title: string, synced: number | string, total: number | string) =>
    `Syncing ${title}...\n${synced}/${total} subscribers`,

  syncComplete: (title: string) => `✅ Sync complete for ${title}!`,

  syncNewContacts: (n: number) => `${n} new contacts`,
  syncExisting: (n: number) => `${n} already existed`,
  syncPrivate: (n: number) => `${n} private (skipped)`,
  syncFailedCount: (n: number) => `${n} failed`,

  syncCheckCrm:
    "\nView your contacts in @crmchat_crm_bot.\n\n💡 New subscribers will sync automatically based on your /settings.",

  syncAlreadySynced: (title: string, count: number) =>
    `${title} is already synced (${count} subscribers).\n\nNew subscribers sync automatically based on your /settings — no need to re-sync.`,

  syncForceButton: "🔄 Force re-sync",
  syncStopBtn: "⏹ Stop sync",
  syncStopped: (title: string) => `⏹ Sync stopped for ${title}.`,

  // ── settings.ts ───────────────────────────────────────────────────
  settingsNeedConnect:
    "You need to connect first.\n\nSend /start to set up your API key.",

  settingsNoChannels:
    "No channels connected yet.\n\nAdd me as admin to a channel or group first.",

  settingsChooseChannel: "Choose a channel to configure:",

  settingsChannelNotFound: "Channel not found. Try /settings again.",

  settingsSessionExpired: "Session expired. Send /start to reconnect.",

  settingsNoChannelsConfigured: "No channels configured.",

  settingsForChannel: (title: string) => `⚙️ Settings for ${title}`,

  settingsProperty: (name: string) => `📋 Custom property: ${name}`,
  settingsPropertyNotSet: "📋 Custom property: not set",

  settingsOnJoin: (label: string) => `➡️ On join: ${label}`,
  settingsOnLeave: (label: string) => `⬅️ On leave: ${label}`,
  settingsOnJoinNone: "➡️ On join: —",
  settingsOnLeaveNone: "⬅️ On leave: —",

  settingsLastSync: (value: string) => `🕐 Last sync: ${value}`,
  settingsLastSyncNever: "🕐 Last sync: never",

  settingsSubscribers: (value: string) => `👥 Subscribers: ${value}`,
  settingsSubscribersUnknown: "👥 Subscribers: unknown",

  settingsBtnSetMapping: "Set custom property",
  settingsBtnRemoveMapping: "Remove custom property",
  settingsBtnBack: "« Back",
  settingsBtnCancel: "Cancel",

  settingsCouldNotLoadProps: "⚠️ Couldn't load custom properties. Try again later.",

  settingsNoConfigurableProps:
    "No custom properties found.\n\nCreate a single-select or text property first in @crmchat_crm_bot > *Custom Properties*.",

  settingsSelectProperty: "Select the property to track for subscribers:",

  settingsPropertyNotFound: "Property not found. Try again.",

  settingsJoinValuePrompt: "What value when someone JOINS?",
  settingsLeaveValuePrompt: "What value when someone LEAVES?",

  settingsJoinTextPrompt: "Type the value to set when someone JOINS this channel:",
  settingsLeaveTextPrompt: "Type the value to set when someone LEAVES this channel:",

  settingsMappingSaved: (propName: string, joinLabel: string, leaveLabel: string) =>
    `✅ Property mapping saved!\n\n${propName}:\n  Join → ${joinLabel}\n  Leave → ${leaveLabel}\n\n💡 Set up automated outreach in @crmchat_crm_bot > *Outreach > CRM Leads*.`,

  settingsSessionExpiredCb: "Session expired. Try /settings again.",

  // ── my-chat-member.ts ─────────────────────────────────────────────
  promotedNoSession: (title: string) =>
    `I've been added to ${title}! 🎉\n\nTo sync subscribers, connect your CRMChat account first — send /start in DM.`,

  promotedWithSession: (title: string, workspaceName: string) =>
    `I've been added to ${title}! 🎉\n\nWant to sync its subscribers to your CRMChat workspace (${workspaceName})?`,

  demoted: (title: string) =>
    `I've been removed from ${title}. Sync stopped.`,

  syncNowBtn: "✅ Sync now",
  settingsFirstBtn: "⚙️ Settings first",
  notNowBtn: "❌ Not now",

  syncNowSessionExpired:
    "Session expired. Reconnect with /start first.",

  syncNowResolveFailed: (reason: string) =>
    `Couldn't resolve channel. ${reason}`,

  settingsFirstMsg:
    "Head to /settings to configure custom properties, then come back to sync.",

  notNowMsg: "No problem! You can sync anytime with /sync.",

  pickWorkspace: "This API key has access to multiple workspaces.\n\nWhich one do you want to connect?",

  switchWorkspaceBtn: "🔄 Connect another workspace",
  switchWorkspaceMsg: "Previous workspace disconnected.\n\nSend me a new API key to connect a different workspace.",
};
