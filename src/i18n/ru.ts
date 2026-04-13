import type { Locale } from "./index.js";

export const ru: Locale = {
  // ── start.ts ──────────────────────────────────────────────────────
  welcome:
    "Привет! 👋\n\nОтправь мне API-ключ CRMChat, чтобы начать.\n\nНайти его можно в <b>Настройки &gt; API-ключи</b> в @crmchat_crm_bot.",

  connectedToWorkspace: (name: string) =>
    `✅ Подключено к ${name}!\n\nТеперь добавь меня админом в каналы или группы, которые хочешь синхронизировать.`,

  alreadyConnected: (workspaceId: string) =>
    `Ты уже подключён к рабочему пространству ${workspaceId}.\n\nИспользуй /sync для синхронизации канала или сначала настрой кастомные поля в /settings.`,

  invalidApiKey: "❌ Неверный API-ключ.\n\nПроверь в <b>Настройки &gt; API-ключи</b> в @crmchat_crm_bot.",
  apiUnreachable: "⚠️ Не удалось связаться с CRMChat API. Попробуй чуть позже.",
  noOrganizations: "Организации для этого API-ключа не найдены.",
  noWorkspaces: "Рабочие пространства для этой организации не найдены.",

  // ── sync.ts ───────────────────────────────────────────────────────
  syncNeedConnect:
    "Сначала нужно подключиться.\n\nОтправь /start, чтобы настроить API-ключ.",

  syncNoChannels:
    "Каналы ещё не подключены.\n\nДобавь меня админом в Telegram-канал или группу — я появлюсь здесь автоматически.",

  syncPickChannel: "Какой канал хочешь синхронизировать?",

  syncChannelNotFound: "Канал не найден. Попробуй /sync ещё раз.",

  syncFailed: (title: string, reason: string) =>
    `❌ Синхронизация ${title} не удалась.\n\n${reason}\n\n⚠️ Примечание: подключённый Telegram-аккаунт должен быть <b>админом</b> синхронизируемого канала.`,

  syncProgress: (title: string, synced: number | string, total: number | string, bar: string) =>
    `Синхронизация ${title}...\n${synced}/${total} подписчиков синхронизировано ${bar}`,

  syncProgressShort: (title: string, synced: number | string, total: number | string) =>
    `Синхронизация ${title}...\n${synced}/${total} подписчиков`,

  syncComplete: (title: string) => `✅ Синхронизация ${title} завершена!`,

  syncNewContacts: (n: number) => `${n} новых контактов`,
  syncExisting: (n: number) => `${n} уже существовали`,
  syncPrivate: (n: number) => `${n} скрытых (пропущено)`,
  syncFailedCount: (n: number) => `${n} с ошибкой`,

  syncCheckCrm:
    "\nСмотри контакты в @crmchat_crm_bot.\n\n💡 Новые подписчики будут синхронизироваться автоматически согласно настройкам /settings.",

  syncAlreadySynced: (title: string, count: number) =>
    `${title} уже синхронизирован (${count} подписчиков).\n\nНовые подписчики синхронизируются автоматически согласно настройкам /settings — повторная синхронизация не нужна.`,

  syncErrNoActiveTgAccount:
    "В твоём рабочем пространстве нет активного Telegram-аккаунта.\n\nДля синхронизации каналов нужен хотя бы один подключённый Telegram-аккаунт. Открой @crmchat_crm_bot &gt; <b>Telegram accounts</b> и подключи свой личный Telegram. Это бесплатно и займёт минуту.\n\n⚠️ Важно: подключённый аккаунт должен быть <b>админом</b> синхронизируемых каналов (обычно это твой личный аккаунт, если канал твой).\n\nПосле этого возвращайся и попробуй /sync ещё раз.",

  syncForceButton: "🔄 Синхронизировать заново",
  syncStopBtn: "⏹ Остановить",
  syncStopped: (title: string) => `⏹ Синхронизация ${title} остановлена.`,

  // ── settings.ts ───────────────────────────────────────────────────
  settingsNeedConnect:
    "Сначала нужно подключиться.\n\nОтправь /start, чтобы настроить API-ключ.",

  settingsNoChannels:
    "Каналы ещё не подключены.\n\nСначала добавь меня админом в канал или группу.",

  settingsChooseChannel: "Выбери канал для настройки:",

  settingsChannelNotFound: "Канал не найден. Попробуй /settings ещё раз.",

  settingsSessionExpired: "Сессия истекла. Отправь /start для переподключения.",

  settingsNoChannelsConfigured: "Каналы не настроены.",

  settingsForChannel: (title: string) => `⚙️ Настройки ${title}`,

  settingsProperty: (name: string) => `📋 Кастомное поле: ${name}`,
  settingsPropertyNotSet: "📋 Кастомное поле: не задано",

  settingsOnJoin: (label: string) => `➡️ При вступлении: ${label}`,
  settingsOnLeave: (label: string) => `⬅️ При выходе: ${label}`,
  settingsOnJoinNone: "➡️ При вступлении: —",
  settingsOnLeaveNone: "⬅️ При выходе: —",

  settingsLastSync: (value: string) => `🕐 Последняя синхронизация: ${value}`,
  settingsLastSyncNever: "🕐 Последняя синхронизация: никогда",

  settingsSubscribers: (value: string) => `👥 Подписчиков: ${value}`,
  settingsSubscribersUnknown: "👥 Подписчиков: неизвестно",

  settingsBtnSetMapping: "Настроить кастомные поля",
  settingsBtnRemoveMapping: "Удалить кастомные поля",
  settingsBtnBack: "« Назад",
  settingsBtnCancel: "Отмена",

  settingsCouldNotLoadProps: "⚠️ Не удалось загрузить кастомные поля. Попробуй позже.",

  settingsNoConfigurableProps:
    "Кастомные поля не найдены.\n\nСначала создай поле типа single-select или text в @crmchat_crm_bot &gt; <b>Кастомные поля</b>.",

  settingsSelectProperty: "Выбери поле для отслеживания подписчиков:",

  settingsPropertyNotFound: "Поле не найдено. Попробуй ещё раз.",

  settingsJoinValuePrompt: "Какое значение при ВСТУПЛЕНИИ?",
  settingsLeaveValuePrompt: "Какое значение при ВЫХОДЕ?",

  settingsJoinTextPrompt: "Введи значение при ВСТУПЛЕНИИ в этот канал:",
  settingsLeaveTextPrompt: "Введи значение при ВЫХОДЕ из этого канала:",

  settingsMappingSaved: (propName: string, joinLabel: string, leaveLabel: string) =>
    `✅ Настройки сохранены!\n\n${propName}:\n  Вступление → ${joinLabel}\n  Выход → ${leaveLabel}\n\n💡 Настрой автоматические рассылки в @crmchat_crm_bot &gt; <b>Рассылки &gt; Лиды из CRM</b>.`,

  settingsSessionExpiredCb: "Сессия истекла. Попробуй /settings ещё раз.",

  // ── my-chat-member.ts ─────────────────────────────────────────────
  promotedNoSession: (title: string) =>
    `Меня добавили в ${title}! 🎉\n\nЧтобы синхронизировать подписчиков, сначала подключи аккаунт CRMChat — отправь /start в ЛС.`,

  promotedWithSession: (title: string, workspaceName: string) =>
    `Меня добавили в ${title}! 🎉\n\nСинхронизировать подписчиков в CRMChat (${workspaceName})?`,

  demoted: (title: string) =>
    `Меня удалили из ${title}. Синхронизация остановлена.`,

  syncNowBtn: "✅ Синхронизировать",
  settingsFirstBtn: "⚙️ Сначала настройки",
  notNowBtn: "❌ Не сейчас",

  syncNowSessionExpired:
    "Сессия истекла. Сначала переподключись через /start.",

  syncNowResolveFailed: (reason: string) =>
    `❌ Не удалось определить канал.\n\n${reason}\n\n⚠️ Примечание: подключённый Telegram-аккаунт должен быть <b>админом</b> синхронизируемого канала.`,

  settingsFirstMsg:
    "Перейди в /settings, чтобы настроить кастомные поля, а потом возвращайся для синхронизации.",

  notNowMsg: "Без проблем! Синхронизировать можно в любое время через /sync.",

  pickWorkspace: "Этот API-ключ имеет доступ к нескольким пространствам.\n\nКакое хочешь подключить?",

  switchWorkspaceBtn: "🔄 Подключить другое пространство",
  switchWorkspaceMsg: "Предыдущее пространство отключено.\n\nОтправь новый API-ключ для подключения другого пространства.",
};
