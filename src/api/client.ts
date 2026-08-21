import type {
  PaginatedResponse,
  SingleResponse,
  Organization,
  Workspace,
  TelegramAccount,
  Contact,
  Property,
  WorkspaceMember,
  CreateContactInput,
  TelegramRawResponse,
} from "./types.js";

// ── Error classes ──────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiAuthError extends ApiError {
  constructor(message = "Unauthorized", body?: unknown) {
    super(message, 401, body);
    this.name = "ApiAuthError";
  }
}

export class RateLimitError extends ApiError {
  public readonly retryAfter: number;

  constructor(retryAfter: number, body?: unknown) {
    super(`Rate limited – retry after ${retryAfter}s`, 429, body);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

// ── Error message extraction ───────────────────────────────────────────

/** Cap detail length so a large body can't flood a Telegram message. */
const MAX_ERROR_DETAIL = 300;

function truncate(text: string): string {
  return text.length > MAX_ERROR_DETAIL
    ? `${text.slice(0, MAX_ERROR_DETAIL - 1)}\u2026`
    : text;
}

function formatIssues(issues: unknown): string | undefined {
  if (!Array.isArray(issues)) return undefined;
  const parts: string[] = [];
  for (const issue of issues) {
    if (typeof issue !== "object" || issue === null) continue;
    const { path, message } = issue as { path?: unknown; message?: unknown };
    if (typeof message !== "string") continue;
    // `path` is an array from zod, a plain string from the property validator.
    const where = Array.isArray(path) ? path.join(".") : typeof path === "string" ? path : "";
    parts.push(where ? `${where}: ${message}` : message);
  }
  return parts.length > 0 ? parts.join("; ") : undefined;
}

/**
 * Pull the useful text out of an error body.
 *
 * The API wraps Telegram RPC errors as HTTP 400 with the raw MTProto text in
 * `message` (CHANNEL_INVALID, CHAT_ADMIN_REQUIRED, FLOOD_WAIT_42, ...), and
 * property validation failures as a generic message plus a `data.issues` list.
 * Both are far more useful than the bare "Bad Request" status text.
 */
export function extractErrorDetail(body?: string): string | undefined {
  if (!body) return undefined;
  const trimmed = body.trim();
  if (!trimmed) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Non-JSON body: usable if it's short prose, useless if it's an HTML page.
    if (trimmed.startsWith("<")) return undefined;
    return truncate(trimmed);
  }

  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { message, code, data } = parsed as {
    message?: unknown;
    code?: unknown;
    data?: unknown;
  };

  const issues =
    typeof data === "object" && data !== null
      ? formatIssues((data as { issues?: unknown }).issues)
      : undefined;

  const base = typeof message === "string" && message ? message : undefined;
  if (base && issues) return truncate(`${base} (${issues})`);
  if (base) return truncate(base);
  if (issues) return truncate(issues);
  if (typeof code === "string" && code) return truncate(code);
  return undefined;
}

/** Build an error message that keeps the server's own explanation. */
export function describeApiError(
  status: number,
  statusText: string,
  body?: string,
): string {
  const detail = extractErrorDetail(body);
  return `API error ${status}: ${detail ?? statusText}`;
}

// ── Client ─────────────────────────────────────────────────────────────

export class CrmChatClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl = process.env.CRMCHAT_API_URL ?? "https://api.crmchat.ai/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, ""); // strip trailing slashes
  }

  // ── Auth / discovery ───────────────────────────────────────────────

  async listOrganizations(): Promise<Organization[]> {
    return this.paginateAll<Organization>("/organizations");
  }

  async listWorkspaces(organizationId: string): Promise<Workspace[]> {
    return this.paginateAll<Workspace>(
      `/workspaces?organizationId=${encodeURIComponent(organizationId)}`,
    );
  }

  /**
   * Workspace members. Note: this endpoint returns a bare `{ data: [...] }`
   * object with no pagination envelope, so it cannot go through paginateAll.
   */
  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const res = await this.request<{ data: WorkspaceMember[] }>(
      `/workspaces/${workspaceId}/members`,
    );
    return res.data;
  }

  // ── Telegram accounts ──────────────────────────────────────────────

  async listTelegramAccounts(workspaceId: string): Promise<TelegramAccount[]> {
    return this.paginateAll<TelegramAccount>(
      `/workspaces/${workspaceId}/telegram-accounts`,
    );
  }

  // ── Contacts ───────────────────────────────────────────────────────

  async listContacts(
    workspaceId: string,
    options?: { filter?: Record<string, string | number> },
  ): Promise<Contact[]> {
    const query = new URLSearchParams();
    if (options?.filter) {
      for (const [k, v] of Object.entries(options.filter)) {
        query.set(`filter[${k}]`, String(v));
      }
    }
    const qs = query.toString();
    const path = `/workspaces/${workspaceId}/contacts${qs ? `?${qs}` : ""}`;
    return this.paginateAll<Contact>(path);
  }

  async createContact(
    workspaceId: string,
    input: CreateContactInput,
  ): Promise<Contact> {
    const res = await this.request<SingleResponse<Contact>>(
      `/workspaces/${workspaceId}/contacts`,
      { method: "POST", body: JSON.stringify(input) },
    );
    return res.data;
  }

  async updateContact(
    workspaceId: string,
    contactId: string,
    patch: Partial<CreateContactInput>,
  ): Promise<Contact> {
    const res = await this.request<SingleResponse<Contact>>(
      `/workspaces/${workspaceId}/contacts/${contactId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/merge-patch+json" },
        body: JSON.stringify(patch),
      },
    );
    return res.data;
  }

  // ── Properties ─────────────────────────────────────────────────────

  async listProperties(workspaceId: string, objectType = "contacts"): Promise<Property[]> {
    return this.paginateAll<Property>(
      `/workspaces/${workspaceId}/properties/${objectType}`,
    );
  }

  // ── Telegram Raw (MTProto proxy) ───────────────────────────────────

  async callTelegramRaw(
    workspaceId: string,
    accountId: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const res = await this.request<TelegramRawResponse>(
      `/workspaces/${workspaceId}/telegram-accounts/${accountId}/call/${encodeURIComponent(method)}`,
      {
        method: "POST",
        body: JSON.stringify({ params }),
      },
    );
    return res.result;
  }

  // ── Internals ──────────────────────────────────────────────────────

  private async request<T>(
    path: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    };

    const res = await fetch(url, {
      method: init?.method,
      headers,
      body: init?.body,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => undefined);
      if (res.status === 401) {
        throw new ApiAuthError("Unauthorized", body);
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after")) || 60;
        throw new RateLimitError(retryAfter, body);
      }
      throw new ApiError(
        describeApiError(res.status, res.statusText, body),
        res.status,
        body,
      );
    }

    return (await res.json()) as T;
  }

  private async paginateAll<T>(basePath: string): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | null = null;
    let pages = 0;
    const MAX_PAGES = 100;
    let prevFirstItem: string | null = null;

    do {
      const sep = basePath.includes("?") ? "&" : "?";
      const path: string = cursor
        ? `${basePath}${sep}startingAfter=${encodeURIComponent(cursor)}`
        : basePath;

      const page: PaginatedResponse<T> = await this.request<PaginatedResponse<T>>(path);

      // Detect repeated pages: if this page starts with the same item as the previous page,
      // the API is returning the same data regardless of cursor
      const firstItem = page.data.length > 0 ? JSON.stringify(page.data[0]) : null;
      if (firstItem && firstItem === prevFirstItem) {
        console.warn(`[paginateAll] API returning duplicate page for ${basePath}, stopping at ${all.length} items`);
        break;
      }
      prevFirstItem = firstItem;

      all.push(...page.data);
      cursor = page.hasMore ? (page.cursors.next ?? null) : null;

      pages++;
      if (pages >= MAX_PAGES) {
        console.warn(`[paginateAll] Hit max pages (${MAX_PAGES}) for ${basePath}`);
        break;
      }
    } while (cursor);

    return all;
  }

}
