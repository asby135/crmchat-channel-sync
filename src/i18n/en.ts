export const en = {
  // ── start.ts ──────────────────────────────────────────────────────
  welcome: "Welcome! Send me your CRMChat API key to get started. Find it in Settings > API Keys.",
  connectedToWorkspace: (name: string) =>
    `Connected to workspace: ${name}! Now add me as admin to channels you want to sync.`,
  alreadyConnected: (workspaceId: string) =>
    `You're connected to workspace: ${workspaceId}. Use /sync to sync a channel, but we recommend setting up custom properties in /settings first.`,
  invalidApiKey: "Invalid API key. Check Settings > API Keys in CRMChat.",
  apiUnreachable: "Could not reach CRMChat API. Please try again.",
  noOrganizations: "No organizations found for this API key.",
  noWorkspaces: "No workspaces found for this organization.",

  // ── sync.ts ───────────────────────────────────────────────────────
  syncNeedConnect:
    "You need to connect first. Send /start to set up your CRMChat API key.",
  syncNoChannels:
    "No channels configured yet. Add me as admin to a channel or group first.",
  syncPickChannel: "Pick a channel to sync:",
  syncChannelNotFound: "Channel not found in config. Try /sync again.",
  syncFailed: (title: string, reason: string) =>
    `Sync failed for ${title}. ${reason}`,
  syncProgress: (title: string, synced: number | string, total: number | string, bar: string) =>
    `Syncing ${title}...\n${synced}/${total} subscribers synced ${bar}`,
  syncProgressShort: (title: string, synced: number | string, total: number | string) =>
    `Syncing ${title}...\n${synced}/${total} subscribers`,
  syncComplete: (title: string) => `Sync complete for ${title}!`,
  syncNewContacts: (n: number) => `${n} new contacts`,
  syncExisting: (n: number) => `${n} already existed`,
  syncPrivate: (n: number) => `${n} private (skipped)`,
  syncFailedCount: (n: number) => `${n} failed`,
  syncCheckCrm: "\nCheck your synced contacts in @crmchat_crm_bot.\nNew subscribers will be synced automatically based on your /settings.",
  syncAlreadySynced: (title: string, count: number) =>
    `${title} was already synced (${count} subscribers).\n\nNew subscribers are synced automatically based on your /settings. No need to re-sync.`,
  syncForceButton: "Force re-sync",

  // ── settings.ts ───────────────────────────────────────────────────
  settingsNeedConnect:
    "You need to connect first. Send /start to set up your CRMChat API key.",
  settingsNoChannels:
    "No channels configured yet. Add me as admin to a channel or group first.",
  settingsChooseChannel: "Choose a channel to configure:",
  settingsChannelNotFound: "Channel not found. Try /settings again.",
  settingsSessionExpired: "Session expired. Send /start to reconnect.",
  settingsNoChannelsConfigured: "No channels configured.",
  settingsForChannel: (title: string) => `Settings for ${title}:`,
  settingsProperty: (name: string) => `Custom property: ${name}`,
  settingsPropertyNotSet: "Custom property: not set",
  settingsOnJoin: (label: string) => `On join: ${label}`,
  settingsOnLeave: (label: string) => `On leave: ${label}`,
  settingsOnJoinNone: "On join: \u2014",
  settingsOnLeaveNone: "On leave: \u2014",
  settingsLastSync: (value: string) => `Last sync: ${value}`,
  settingsLastSyncNever: "Last sync: never",
  settingsSubscribers: (value: string) => `Subscribers: ${value}`,
  settingsSubscribersUnknown: "Subscribers: unknown",
  settingsBtnSetMapping: "Set custom property",
  settingsBtnRemoveMapping: "Remove custom property",
  settingsBtnBack: "Back",
  settingsBtnCancel: "Cancel",
  settingsCouldNotLoadProps: "Could not load custom properties. Try again later.",
  settingsNoConfigurableProps:
    "No custom properties found. First create a single-select or text custom property in @crmchat_crm_bot > Custom properties.",
  settingsSelectProperty: "Select the custom property to set for new subscribers/unsubscribers:",
  settingsPropertyNotFound: "Custom property not found. Try again.",
  settingsJoinValuePrompt: "What value when someone JOINS?",
  settingsLeaveValuePrompt: "What value when someone LEAVES?",
  settingsJoinTextPrompt: "Type the value to set when someone JOINS this channel:",
  settingsLeaveTextPrompt: "Type the value to set when someone LEAVES this channel:",
  settingsMappingSaved: (propName: string, joinLabel: string, leaveLabel: string) =>
    `Custom property saved!\n${propName}: ${joinLabel} (join) / ${leaveLabel} (leave)\n\n
  After the sync you can set up automated outreach for new subscribers and unsubscribers in CRMChat. Go to @crmchat_crm_bot > Outreach > CRM Leads.`,
  settingsSessionExpiredCb: "Session expired. Try /settings again.",

  // ── my-chat-member.ts ─────────────────────────────────────────────
  promotedNoSession: (title: string) =>
    `I've been added to ${title}! To sync subscribers, first connect your CRMChat account: send /start to me in DM.`,
  promotedWithSession: (title: string, workspaceName: string) =>
    `I've been added to **${title}**! Want to sync its subscribers to your CRMChat workspace (${workspaceName})?`,
  demoted: (title: string) =>
    `I've been removed from ${title}. Sync stopped.`,
  syncNowBtn: "\u2705 Sync now",
  settingsFirstBtn: "\u2699\ufe0f Settings first",
  notNowBtn: "\u274c Not now",
  syncNowSessionExpired:
    "Session expired. Please reconnect with /start first.",
  syncNowResolveFailed: (reason: string) =>
    `Could not resolve channel. ${reason}`,
  settingsFirstMsg:
    "Use /settings to configure custom properties, then come back.",
  notNowMsg: "No problem! You can sync anytime with /sync.",
};
