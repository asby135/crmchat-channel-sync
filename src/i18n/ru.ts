import type { Locale } from "./index.js";

export const ru: Locale = {
  // ── start.ts ──────────────────────────────────────────────────────
  welcome: "Привет! Отправь мне API-ключ CRMChat, чтобы начать. Найти его можно в @crmchat_crm_bot > Настройки > API-ключи.",
  connectedToWorkspace: (name: string) =>
    `Подключено к рабочему пространству: ${name}! Теперь добавь меня админом в каналы, которые хочешь синхронизировать.`,
  alreadyConnected: (workspaceId: string) =>
    `Ты подключён к рабочему пространству: ${workspaceId}. Используй /sync для синхронизации канала, но сначала рекомендуем настроить кастомные поля в /settings.`,
  invalidApiKey: "Неверный API-ключ. Проверь Настройки > API-ключи в CRMChat.",
  apiUnreachable: "Не удалось связаться с CRMChat API. Попробуй ещё раз.",
  noOrganizations: "Организации для этого API-ключа не найдены.",
  noWorkspaces: "Рабочие пространства для этой организации не найдены.",

  // ── sync.ts ───────────────────────────────────────────────────────
  syncNeedConnect:
    "Сначала нужно подключиться. Отправь /start, чтобы настроить API-ключ CRMChat.",
  syncNoChannels:
    "Каналы ещё не настроены. Сначала добавь меня админом в канал или группу.",
  syncPickChannel: "Выбери канал для синхронизации:",
  syncChannelNotFound: "Канал не найден в настройках. Попробуй /sync ещё раз.",
  syncFailed: (title: string, reason: string) =>
    `Синхронизация ${title} не удалась. ${reason}`,
  syncProgress: (title: string, synced: number | string, total: number | string, bar: string) =>
    `Синхронизация ${title}...\n${synced}/${total} подписчиков синхронизировано ${bar}`,
  syncProgressShort: (title: string, synced: number | string, total: number | string) =>
    `Синхронизация ${title}...\n${synced}/${total} подписчиков`,
  syncComplete: (title: string) => `Синхронизация ${title} завершена!`,
  syncNewContacts: (n: number) => `${n} новых контактов`,
  syncExisting: (n: number) => `${n} уже существовали`,
  syncPrivate: (n: number) => `${n} скрытых (пропущено)`,
  syncFailedCount: (n: number) => `${n} с ошибкой`,

  // ── settings.ts ───────────────────────────────────────────────────
  settingsNeedConnect:
    "Сначала нужно подключиться. Отправь /start, чтобы настроить API-ключ CRMChat.",
  settingsNoChannels:
    "Каналы ещё не настроены. Сначала добавь меня админом в канал или группу.",
  settingsChooseChannel: "Выбери канал для настройки:",
  settingsChannelNotFound: "Канал не найден. Попробуй /settings ещё раз.",
  settingsSessionExpired: "Сессия истекла. Отправь /start для переподключения.",
  settingsNoChannelsConfigured: "Каналы не настроены.",
  settingsForChannel: (title: string) => `Настройки ${title}:`,
  settingsProperty: (name: string) => `Кастомное поле: ${name}`,
  settingsPropertyNotSet: "Кастомное поле: не задано",
  settingsOnJoin: (label: string) => `При вступлении: ${label}`,
  settingsOnLeave: (label: string) => `При выходе: ${label}`,
  settingsOnJoinNone: "При вступлении: \u2014",
  settingsOnLeaveNone: "При выходе: \u2014",
  settingsLastSync: (value: string) => `Последняя синхронизация: ${value}`,
  settingsLastSyncNever: "Последняя синхронизация: никогда",
  settingsSubscribers: (value: string) => `Подписчиков: ${value}`,
  settingsSubscribersUnknown: "Подписчиков: неизвестно",
  settingsBtnSetMapping: "Настроить кастомные поля",
  settingsBtnRemoveMapping: "Удалить кастомные поля",
  settingsBtnBack: "Назад",
  settingsBtnCancel: "Отмена",
  settingsCouldNotLoadProps: "Не удалось загрузить кастомные поля. Попробуй позже.",
  settingsNoConfigurableProps:
    "Кастомные поля не найдены. Сначала создай кастомное поле типа single-select или text в @crmchat_crm_bot > Кастомные поля",
  settingsSelectProperty: "Выбери кастомное поле для установки для новых подписчиков/отписавшихся:",
  settingsPropertyNotFound: "Кастомное поле не найдено. Попробуй ещё раз.",
  settingsJoinValuePrompt: "Какое значение при ВСТУПЛЕНИИ?",
  settingsLeaveValuePrompt: "Какое значение при ВЫХОДЕ?",
  settingsJoinTextPrompt: "Введи значение для установки при ВСТУПЛЕНИИ в этот канал:",
  settingsLeaveTextPrompt: "Введи значение для установки при ВЫХОДЕ из этого канала:",
  settingsMappingSaved: (propName: string, joinLabel: string, leaveLabel: string) =>
    `Кастомные поля сохранены!\n${propName}: ${joinLabel} (вступление) / ${leaveLabel} (выход). 
  
  Теперь в CRMChat ты можешь настроить автоматические рассылки как новым подписчикам, так и отписавшимся. Для этого в @crmchat_crm_bot открой раздел Рассылки > Лиды из CRM. `,
  settingsSessionExpiredCb: "Сессия истекла. Попробуй /settings ещё раз.",

  // ── my-chat-member.ts ─────────────────────────────────────────────
  promotedNoSession: (title: string) =>
    `Меня добавили в ${title}! Чтобы синхронизировать подписчиков, сначала подключи аккаунт CRMChat: отправь /start мне в ЛС.`,
  promotedWithSession: (title: string, workspaceName: string) =>
    `Меня добавили в **${title}**! Хочешь синхронизировать подписчиков в рабочее пространство CRMChat (${workspaceName})?`,
  demoted: (title: string) =>
    `Меня удалили из ${title}. Синхронизация остановлена.`,
  syncNowBtn: "\u2705 Синхронизировать",
  settingsFirstBtn: "\u2699\ufe0f Сначала настройки",
  notNowBtn: "\u274c Не сейчас",
  syncNowSessionExpired:
    "Сессия истекла. Сначала переподключись через /start.",
  syncNowResolveFailed: (reason: string) =>
    `Не удалось определить канал. ${reason}`,
  settingsFirstMsg:
    "Используй /settings для настройки кастомных полей, затем возвращайся.",
  notNowMsg: "Без проблем! Синхронизировать можно в любое время через /sync.",
};
