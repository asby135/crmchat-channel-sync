import type { CrmChatClient } from "../api/client.js";
import type { Property, WorkspaceMember, WorkspaceRole } from "../api/types.js";

/**
 * Workaround for a CRM API validation bug on contact creation.
 *
 * The API contract says `ownerId` is optional and "defaults to the
 * authenticated user". That default is real (contacts.create applies
 * `body.ownerId ?? context.user.id`) but it runs AFTER property validation.
 * Validation, in create mode, injects `null` for every required property the
 * body omits — including `ownerId` when a workspace marks the Owner property
 * required — and then rejects the null as "Property is required". Result: a
 * 400 on every contact create in those workspaces, for real-time join/leave
 * and for bulk sync alike.
 *
 * Since the bot authenticates with an API key and the API exposes no endpoint
 * for "who am I", it cannot reproduce the server's intended default. Instead
 * it picks a stable workspace member (admins first) and sends that explicitly.
 *
 * Remove this once the API validates before applying its own defaults.
 */

const ROLE_PRIORITY: Record<WorkspaceRole, number> = {
  admin: 0,
  member: 1,
  chatter: 2,
};

/** Resolved owner per workspace. Membership changes rarely; the bot is long-lived. */
const ownerCache = new Map<string, string>();

/**
 * True when this workspace's contact schema marks `ownerId` required, which is
 * exactly the condition that trips the API's create-mode validation.
 */
export function ownerIdIsRequired(properties: Property[]): boolean {
  return properties.some((prop) => prop.key === "ownerId" && prop.required);
}

/**
 * Pick a deterministic owner: lowest-privilege-number role first (admin before
 * member before chatter), then lowest userId. Stable across restarts so the
 * same workspace keeps attributing contacts to the same person.
 */
export function pickOwner(members: WorkspaceMember[]): string | undefined {
  const ranked = [...members].sort((a, b) => {
    const byRole = (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99);
    return byRole !== 0 ? byRole : a.userId.localeCompare(b.userId);
  });
  return ranked[0]?.userId;
}

/**
 * Resolve an ownerId for the workspace, caching the result. Returns undefined
 * when the workspace has no members to attribute contacts to.
 */
export async function resolveOwnerId(
  client: CrmChatClient,
  workspaceId: string,
): Promise<string | undefined> {
  const cached = ownerCache.get(workspaceId);
  if (cached) return cached;

  const members = await client.listWorkspaceMembers(workspaceId);
  const ownerId = pickOwner(members);
  // Only successes are cached, so a transient API failure retries next time.
  if (ownerId) ownerCache.set(workspaceId, ownerId);
  return ownerId;
}

/**
 * Resolve `ownerId` only when this workspace needs it. Returns undefined when
 * the property is not required, preserving the API's own defaulting behaviour
 * for every workspace that isn't affected by the bug.
 */
export async function resolveOwnerIdIfRequired(
  client: CrmChatClient,
  workspaceId: string,
  properties: Property[],
): Promise<string | undefined> {
  if (!ownerIdIsRequired(properties)) return undefined;

  const ownerId = await resolveOwnerId(client, workspaceId);
  if (!ownerId) {
    throw new Error(
      `Workspace ${workspaceId} requires ownerId on contacts but has no members to assign as owner`,
    );
  }
  return ownerId;
}

/** Test seam. Clears one workspace, or all of them when called with no argument. */
export function clearOwnerCache(workspaceId?: string): void {
  if (workspaceId) ownerCache.delete(workspaceId);
  else ownerCache.clear();
}
