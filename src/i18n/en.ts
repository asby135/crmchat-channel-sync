export const en = {
  // ── start.ts ──────────────────────────────────────────────────────
  welcome:
    "Hey! 👋\n\nSend me your CRMChat API key to get started.\n\nFind it in <b>Settings &gt; API Keys</b> in @crmchat_crm_bot.",

  connectedToWorkspace: (name: string) =>
    `✅ Connected to ${name}!\n\nNow add me as admin to the channels or groups you want to sync.\n\nℹ️ No specific permissions needed — just admin status is enough.`,

  alreadyConnected: (workspaceId: string) =>
    `You're already connected to workspace ${workspaceId}.\n\nUse /sync to sync a channel, or configure custom properties first in /settings.`,

  invalidApiKey: "❌ Invalid API key.\n\nDouble-check in <b>Settings &gt; API Keys</b> in @crmchat_crm_bot.",
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

  syncErrAdminNote:
    "⚠️ Note: the connected Telegram account must be an <b>admin</b> of the channel you want to sync.",

  syncErrNoActiveTgAccount:
    "No active Telegram account found in your workspace.\n\nTo sync channels, you need at least one Telegram account connected. Open @crmchat_crm_bot &gt; <b>Telegram accounts</b> and connect your personal Telegram. It's free and only takes a minute.\n\n⚠️ Important: the connected account must be an <b>admin</b> of the channels you want to sync (typically your own account if you own the channel).\n\nThen come back and try /sync again.",

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
    "No custom properties found.\n\nCreate a single-select or text property first in @crmchat_crm_bot &gt; <b>Custom Properties</b>.",

  settingsSelectProperty: "Select the property to track for subscribers:",

  settingsPropertyNotFound: "Property not found. Try again.",

  settingsJoinValuePrompt: "What value when someone JOINS?",
  settingsLeaveValuePrompt: "What value when someone LEAVES?",

  settingsJoinTextPrompt: "Type the value to set when someone JOINS this channel:",
  settingsLeaveTextPrompt: "Type the value to set when someone LEAVES this channel:",

  settingsMappingSaved: (propName: string, joinLabel: string, leaveLabel: string) =>
    `✅ Property mapping saved!\n\n${propName}:\n  Join → ${joinLabel}\n  Leave → ${leaveLabel}\n\n💡 After the sync, set up automated outreach in @crmchat_crm_bot &gt; <b>Outreach &gt; CRM Leads</b>.`,

  settingsSessionExpiredCb: "Session expired. Try /settings again.",

  // ── my-chat-member.ts ─────────────────────────────────────────────
  promotedNoSession: (title: string) =>
    `I've been added to ${title}! 🎉\n\nTo sync subscribers, connect your CRMChat account first — send /start in DM.`,

  promotedWithSession: (
    title: string,
    workspaceName: string,
    defaultMapping?: { joinLabel: string; leaveLabel: string },
  ) => {
    const lines = [
      `I've been added to ${title}! 🎉`,
      "",
      `✅ New subscribers will sync to CRMChat (${workspaceName}) automatically from now on.`,
    ];
    if (defaultMapping) {
      lines.push(
        "",
        `📋 Subscriber tracking: new subs → <b>${defaultMapping.joinLabel}</b>, unsubs → <b>${defaultMapping.leaveLabel}</b>. Change anytime in /settings. Change these custom properties in @crmchat_crm_bot &gt; <b>Custom Properties</b>.`,
      );
    } else {
      lines.push(
        "",
        "💡 Tip: if you want to track subscribers via a custom property in CRMChat, set it up in /settings.",
      );
    }
    lines.push(
      "",
      "🔄 To back-fill existing subscribers, connect a Telegram account (channel admin) in @crmchat_crm_bot &gt; <b>Telegram accounts</b> (required to read the subscriber list), then tap <b>Sync now</b> below.",
      "",
      "ℹ️ Sync is a one-time action. After the sync, you can disconnect your main account and connect different accounts to run message sequences.",
    );
    return lines.join("\n");
  },

  demoted: (title: string) =>
    `I've been removed from ${title}. Sync stopped.`,

  syncNowBtn: "✅ Sync now",
  settingsFirstBtn: "⚙️ Settings",
  notNowBtn: "❌ Not now",
  mainMenuBtn: "🏠 Main menu",

  syncNowSessionExpired:
    "Session expired. Reconnect with /start first.",

  syncNowResolveFailed: (reason: string) =>
    `❌ Couldn't resolve channel.\n\n${reason}\n\n⚠️ Note: the connected Telegram account must be an <b>admin</b> of the channel you want to sync.`,

  notNowMsg: "No problem! You can sync anytime with /sync.",

  pickWorkspace: "This API key has access to multiple workspaces.\n\nWhich one do you want to connect?",

  switchWorkspaceBtn: "🔄 Connect another workspace",
  switchWorkspaceMsg: "Previous workspace disconnected.\n\nSend me a new API key to connect a different workspace.",
};
