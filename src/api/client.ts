import type {
  PaginatedResponse,
  SingleResponse,
  Organization,
  Workspace,
  TelegramAccount,
  Contact,
  Property,
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
    query.set("limit", "100");
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
        `API error ${res.status}: ${res.statusText}`,
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

    do {
      const sep = basePath.includes("?") ? "&" : "?";
      const path: string = cursor
        ? `${basePath}${sep}cursor=${encodeURIComponent(cursor)}`
        : basePath;

      const page: PaginatedResponse<T> = await this.request<PaginatedResponse<T>>(path);
      all.push(...page.data);

      const nextCursor = page.hasMore ? (page.cursors.next ?? null) : null;

      if (nextCursor && nextCursor === cursor) {
        console.warn(`[paginateAll] Cursor not advancing for ${basePath}, trying offset fallback`);
        // Fall back to offset-based pagination
        await this.paginateByOffset(basePath, all);
        break;
      }

      cursor = nextCursor;
      pages++;
      if (pages >= MAX_PAGES) {
        console.warn(`[paginateAll] Hit max pages (${MAX_PAGES}) for ${basePath}`);
        break;
      }
    } while (cursor);

    return all;
  }

  /** Offset-based fallback when cursor pagination doesn't advance */
  private async paginateByOffset<T>(basePath: string, all: T[]): Promise<void> {
    const MAX_PAGES = 100;
    let offset = all.length;

    for (let page = 0; page < MAX_PAGES; page++) {
      const sep = basePath.includes("?") ? "&" : "?";
      const path = `${basePath}${sep}offset=${offset}`;

      try {
        const res: PaginatedResponse<T> = await this.request<PaginatedResponse<T>>(path);
        if (!res.data || res.data.length === 0) break;
        all.push(...res.data);
        offset += res.data.length;
        if (!res.hasMore) break;
      } catch (err) {
        // API might not support offset param — stop and use what we have
        console.warn(`[paginateByOffset] Offset fallback failed at offset=${offset}, using ${all.length} items`);
        break;
      }
    }
  }
}
