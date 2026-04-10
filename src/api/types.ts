// API response wrappers
export interface PaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  cursors: { next: string | null; previous: string | null };
}

export interface SingleResponse<T> {
  data: T;
}

// Domain types
export interface Organization {
  id: string;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
  organizationId: string;
}

export interface TelegramAccount {
  id: string;
  workspaceId: string;
  status: "active" | "offline" | "unauthorized" | "banned" | "frozen";
  telegram: {
    id: number;
    username?: string | null;
    phone: string | null;
    fullName?: string | null;
  };
}

export interface Contact {
  id: string;
  fullName: string;
  workspaceId: string;
  ownerId: string;
  telegram?: {
    id?: number;
    username?: string;
  };
  custom?: Record<string, unknown>;
}

export interface Property {
  key: string;
  name: string;
  type: string;
  required: boolean;
  options?: Array<{ label: string; value: string }>;
}

// Contact creation input (ownerId is optional, API defaults to authenticated user)
export interface CreateContactInput {
  fullName: string;
  ownerId?: string;
  telegram?: {
    id?: number;
    username?: string;
  };
  custom?: Record<string, unknown>;
}

// telegramRaw call
export interface TelegramRawResponse {
  result: unknown;
}
