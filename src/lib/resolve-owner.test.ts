import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CrmChatClient } from "../api/client.js";
import type { Property, WorkspaceMember } from "../api/types.js";
import {
  ownerIdIsRequired,
  pickOwner,
  resolveOwnerId,
  resolveOwnerIdIfRequired,
  clearOwnerCache,
} from "./resolve-owner.js";

function property(key: string, required: boolean): Property {
  return { key, name: key, type: "text", required };
}

function member(userId: string, role: WorkspaceMember["role"]): WorkspaceMember {
  return { userId, role, user: { name: userId } };
}

function fakeClient(members: WorkspaceMember[]) {
  const listWorkspaceMembers = vi.fn().mockResolvedValue(members);
  return { client: { listWorkspaceMembers } as unknown as CrmChatClient, listWorkspaceMembers };
}

beforeEach(() => {
  clearOwnerCache();
});

describe("ownerIdIsRequired", () => {
  it("is true when the workspace marks ownerId required", () => {
    expect(ownerIdIsRequired([property("ownerId", true)])).toBe(true);
  });

  it("is false when ownerId exists but is optional", () => {
    expect(ownerIdIsRequired([property("ownerId", false)])).toBe(false);
  });

  it("is false when ownerId is absent", () => {
    expect(ownerIdIsRequired([property("custom.stage", true)])).toBe(false);
  });
});

describe("pickOwner", () => {
  it("prefers admins over members and chatters", () => {
    const picked = pickOwner([
      member("u_chatter", "chatter"),
      member("u_member", "member"),
      member("u_admin", "admin"),
    ]);
    expect(picked).toBe("u_admin");
  });

  it("breaks ties by userId so the choice is stable across restarts", () => {
    expect(pickOwner([member("u_b", "admin"), member("u_a", "admin")])).toBe("u_a");
    expect(pickOwner([member("u_a", "admin"), member("u_b", "admin")])).toBe("u_a");
  });

  it("returns undefined for an empty workspace", () => {
    expect(pickOwner([])).toBeUndefined();
  });
});

describe("resolveOwnerId", () => {
  it("caches the resolved owner per workspace", async () => {
    const { client, listWorkspaceMembers } = fakeClient([member("u1", "admin")]);

    expect(await resolveOwnerId(client, "ws1")).toBe("u1");
    expect(await resolveOwnerId(client, "ws1")).toBe("u1");

    expect(listWorkspaceMembers).toHaveBeenCalledOnce();
  });

  it("does not cache a miss, so a later lookup retries", async () => {
    const listWorkspaceMembers = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([member("u1", "admin")]);
    const client = { listWorkspaceMembers } as unknown as CrmChatClient;

    expect(await resolveOwnerId(client, "ws1")).toBeUndefined();
    expect(await resolveOwnerId(client, "ws1")).toBe("u1");
    expect(listWorkspaceMembers).toHaveBeenCalledTimes(2);
  });
});

describe("resolveOwnerIdIfRequired", () => {
  it("skips the members lookup when ownerId is not required", async () => {
    const { client, listWorkspaceMembers } = fakeClient([member("u1", "admin")]);

    const ownerId = await resolveOwnerIdIfRequired(client, "ws1", [
      property("custom.stage", true),
    ]);

    expect(ownerId).toBeUndefined();
    expect(listWorkspaceMembers).not.toHaveBeenCalled();
  });

  it("resolves an owner when ownerId is required", async () => {
    const { client } = fakeClient([member("u_admin", "admin")]);

    const ownerId = await resolveOwnerIdIfRequired(client, "ws1", [
      property("ownerId", true),
    ]);

    expect(ownerId).toBe("u_admin");
  });

  it("throws a clear error when the workspace has no members", async () => {
    const { client } = fakeClient([]);

    await expect(
      resolveOwnerIdIfRequired(client, "ws1", [property("ownerId", true)]),
    ).rejects.toThrow(/requires ownerId .* no members/);
  });
});
