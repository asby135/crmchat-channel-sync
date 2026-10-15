import type { Locale } from "./index.js";

export const ru: Locale = {
  // ── start.ts ──────────────────────────────────────────────────────
  welcome:
    'Привет! 👋\n\nОтправь мне API-ключ CRMChat, чтобы начать.\n\nНайти его можно в <b>Настройки &gt; API-ключи</b> в @crmchat_crm_bot.\n\n🎥 <a href="https://crmchat.ai/ru/help-center/telegram-channel-crm-sync">Посмотреть видео-инструкцию</a>',

  connectedToWorkspace: (name: string) =>
    `✅ Подключено к ${name}!\n\nТеперь добавь меня админом в каналы или группы, которые хочешь синхронизировать.\n\nℹ️ Особые права не нужны — достаточно статуса админа.`,

  invalidApiKey: "❌ Неверный API-ключ.\n\nПроверь в <b>Настройки &gt; API-ключи</b> в @crmchat_crm_bot.",
  apiUnreachable: "⚠️ Не удалось связаться с CRMChat API. Попробуй чуть позже.",
  noOrganizations: "Организации для этого API-ключа не найдены.",
  noWorkspaces: "Рабочие пространства для этой организации не найдены.",

  // ── sync.ts ───────────────────────────────────────────────────────
  syncNeedConnect:
    "Сначала нужно подключиться.\n\nОтправь /start, чтобы настроить API-ключ.",

  syncNoChannels:
    "Каналы ещё не подключены.\n\nДобавь меня админом в Telegram-канал или группу — я появлюсь здесь автоматически.\n\nℹ️ Если добавлял меня с другого Telegram-аккаунта, отправь API-ключ и с него тоже.",

  syncPickChannel: "Какой канал хочешь синхронизировать?",

  syncChannelNotFound: "Канал не найден. Попробуй /sync ещё раз.",

  syncFailed: (title: string, reason: string) =>
    `❌ Синхронизация ${title} не удалась.\n\n${reason}`,

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

  syncBroadcastCapNote:
    "\nℹ️ Telegram показывает админу только ~200 подписчиков broadcast-каналов. Подписчиков сверх этого лимита подтянуть не получится. <b>Новые вступления и выходы после этого момента отслеживаются автоматически, без ограничения.</b>",

  syncAlreadySynced: (title: string, count: number) =>
    `${title} уже синхронизирован (${count} подписчиков).\n\nНовые подписчики синхронизируются автоматически согласно настройкам /settings — повторная синхронизация не нужна.`,

  syncErrAdminNote:
    "⚠️ Примечание: подключённый Telegram-аккаунт должен быть <b>админом</b> синхронизируемого канала.",

  syncErrNoActiveTgAccount:
    "К твоему рабочему пространству CRMChat не подключён ни один Telegram-аккаунт.\n\nПодключи аккаунт админа канала/чата в @crmchat_crm_bot в разделе <b>Telegram accounts</b> и попробуй /sync ещё раз.",

  // ── error explanations (lib/api-errors.ts) ────────────────────────

  errChannelNotVisible:
    "Подключённый Telegram-аккаунт не видит этот канал.\n\nУбедись, что аккаунт админа канала/чата подключён в CRMChat в разделе <b>Telegram accounts</b>.",

  errChannelPrivate:
    "Подключённый Telegram-аккаунт больше не состоит в этом канале.\n\nВерни его в канал и сделай админом.",

  errAdminRequired:
    "Подключённый Telegram-аккаунт не админ этого канала.\n\nНазначь его админом в настройках канала — особые права не нужны.",

  errAccountDisconnected:
    "Telegram-аккаунт больше не подключён к CRMChat.\n\nПодключи его заново в @crmchat_crm_bot &gt; <b>Telegram accounts</b>.",

  errTelegramUnavailable:
    "Telegram временно недоступен. Попробуй через несколько минут.",

  errFloodWait: (seconds: number) =>
    `Telegram просит подождать ${seconds} сек. Попробуй после этого.`,

  errApiKeyInvalid:
    "CRMChat не принял API-ключ.\n\nВозьми новый в <b>Настройки &gt; API-ключи</b> и отправь /start.",

  errRateLimited: (seconds: number) =>
    `Слишком много запросов. Попробуй через ${seconds} сек.`,

  errOwnerRequired:
    "В твоём рабочем пространстве CRMChat поле <b>Владелец</b> обязательно для контактов, а синхронизация не смогла определить, на кого их назначить.\n\nДобавь участника в рабочее пространство или сделай поле необязательным.",

  errTechnicalCode: (code: string) => `<i>Технические детали: ${code}</i>`,

  syncForceButton: "🔄 Синхронизировать заново",
  syncStopBtn: "⏹ Остановить",
  syncStopped: (title: string) => `⏹ Синхронизация ${title} остановлена.`,

  // ── settings.ts ───────────────────────────────────────────────────
  settingsNeedConnect:
    "Сначала нужно подключиться.\n\nОтправь /start, чтобы настроить API-ключ.",

  settingsNoChannels:
    "Каналы ещё не подключены.\n\nСначала добавь меня админом в канал или группу.\n\nℹ️ Если добавлял меня с другого Telegram-аккаунта, отправь API-ключ и с него тоже.",

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
    `✅ Настройки сохранены!\n\n${propName}:\n  Вступление → ${joinLabel}\n  Выход → ${leaveLabel}\n\n💡 После синхронизации настрой автоматические рассылки в @crmchat_crm_bot &gt; <b>Рассылки &gt; Лиды из CRM</b>.`,

  settingsSessionExpiredCb: "Сессия истекла. Попробуй /settings ещё раз.",

  // ── my-chat-member.ts ─────────────────────────────────────────────
  promotedNoSession: (title: string) =>
    `Меня добавили в ${title}! 🎉\n\nЧтобы синхронизировать подписчиков, сначала подключи аккаунт CRMChat — отправь /start в ЛС.`,

  promotedWithSession: (
    title: string,
    workspaceName: string,
    defaultMapping?: { joinLabel: string; leaveLabel: string; propertyName: string },
  ) => {
    const lines = [
      `Меня добавили в ${title}! 🎉`,
      "",
      `✅ Новые подписчики будут автоматически синхронизироваться в CRMChat (${workspaceName}).`,
    ];
    if (defaultMapping) {
      lines.push(
        "",
        `📋 Отслеживание подписчиков через <b>${defaultMapping.propertyName}</b>: новые → <b>${defaultMapping.joinLabel}</b>, отписавшиеся → <b>${defaultMapping.leaveLabel}</b>. Настроить другие поля можно в /settings. Сами кастомные поля меняются в @crmchat_crm_bot &gt; <b>Кастомные поля</b>.`,
      );
    } else {
      lines.push(
        "",
        "💡 Совет: если хочешь отслеживать подписчиков через кастомное поле в CRMChat, настрой его в /settings.",
      );
    }
    lines.push(
      "",
      "🔄 Чтобы подтянуть существующих подписчиков, подключи Telegram-аккаунт (админа канала) в @crmchat_crm_bot &gt; <b>Telegram accounts</b> (это нужно, чтобы получить список подписчиков), а потом нажми <b>Синхронизировать</b> ниже.",
      "",
      "ℹ️ Синхронизация — одноразовое действие. После неё можно отключить свой основной аккаунт и подключить другие, чтобы запускать рассылки.",
    );
    return lines.join("\n");
  },

  demoted: (title: string) =>
    `Меня удалили из ${title}. Синхронизация остановлена.`,

  syncNowBtn: "✅ Синхронизировать",
  settingsFirstBtn: "⚙️ Настройки",
  notNowBtn: "❌ Не сейчас",
  mainMenuBtn: "🏠 Главное меню",

  syncNowSessionExpired:
    "Сессия истекла. Сначала переподключись через /start.",

  syncNowResolveFailed: (reason: string) =>
    `❌ Не удалось определить канал.\n\n${reason}`,

  notNowMsg: "Без проблем! Синхронизировать можно в любое время через /sync.",

  pickWorkspace: "Этот API-ключ имеет доступ к нескольким пространствам.\n\nКакое хочешь подключить?",
  pickWorkspaceCount: (n: number) => `Доступно пространств: ${n}.`,
  pickWorkspacePage: (page: number, total: number) => `${page}/${total}`,
  unexpectedError: "⚠️ Что-то пошло не так. Попробуй ещё раз через минуту.",

  switchWorkspaceBtn: "🔄 Подключить другое пространство",
  switchWorkspaceMsg: "Предыдущее пространство отключено.\n\nОтправь новый API-ключ для подключения другого пространства.",

  mainMenuPickChannel: "Какой канал?",
  mainMenuNoChannels: (workspaceName: string) =>
    `Подключено к ${workspaceName}, но каналов пока нет.\n\nДобавь меня админом в Telegram-канал или группу, чтобы начать отслеживать подписчиков.\n\nℹ️ Особые права не нужны — достаточно статуса админа.\n\nℹ️ Если добавлял меня с другого Telegram-аккаунта, отправь API-ключ и с него тоже.`,
};
