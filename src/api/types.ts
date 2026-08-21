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

export type WorkspaceRole = "admin" | "member" | "chatter";

export interface WorkspaceMember {
  userId: string;
  role: WorkspaceRole;
  user: {
    name: string;
    avatarUrl?: string;
    timezone?: string;
    telegramUsername?: string;
  };
}

export interface Property {
  key: string;
  name: string;
  type: string;
  required: boolean;
  options?: Array<{ label: string; value: string }>;
}

// Contact creation input.
//
// ownerId is optional in the API contract ("defaults to the authenticated
// user"), but that default is applied AFTER property validation. When a
// workspace marks the `ownerId` property required, the API injects a null and
// rejects the create before its own default runs. See resolveOwnerId() in
// src/lib/resolve-owner.ts — we send ownerId explicitly in that case.
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
