import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyChatMemberChange, createContactForUser } from "./chat-member.js";
import type { CrmChatClient } from "../api/client.js";
import type { Property } from "../api/types.js";
import { clearOwnerCache } from "../lib/resolve-owner.js";

describe("classifyChatMemberChange", () => {
  // Join cases
  it("left -> member = joined", () => {
    expect(classifyChatMemberChange("left", "member")).toBe("joined");
  });

  it("kicked -> member = joined", () => {
    expect(classifyChatMemberChange("kicked", "member")).toBe("joined");
  });

  it("restricted -> member = joined", () => {
    expect(classifyChatMemberChange("restricted", "member")).toBe("joined");
  });

  // Leave cases
  it("member -> left = left", () => {
    expect(classifyChatMemberChange("member", "left")).toBe("left");
  });

  it("member -> kicked = left", () => {
    expect(classifyChatMemberChange("member", "kicked")).toBe("left");
  });

  it("administrator -> left = left", () => {
    expect(classifyChatMemberChange("administrator", "left")).toBe("left");
  });

  // Ignore cases
  it("member -> administrator = ignore (promotion, not a join)", () => {
    expect(classifyChatMemberChange("member", "administrator")).toBe("ignore");
  });

  it("administrator -> member = ignore (demotion, not a leave)", () => {
    expect(classifyChatMemberChange("administrator", "member")).toBe("ignore");
  });

  it("left -> left = ignore", () => {
    expect(classifyChatMemberChange("left", "left")).toBe("ignore");
  });
});

// ── Contact creation ─────────────────────────────────────────────────

function property(key: string, required: boolean): Property {
  return { key, name: key, type: "text", required };
}

function mockClient(properties: Property[]) {
  const createContact = vi.fn().mockResolvedValue({ id: "c1" });
  const listWorkspaceMembers = vi
    .fn()
    .mockResolvedValue([{ userId: "u_admin", role: "admin", user: { name: "Admin" } }]);
  const client = {
    listProperties: vi.fn().mockResolvedValue(properties),
    listWorkspaceMembers,
    createContact,
  } as unknown as CrmChatClient;
  return { client, createContact, listWorkspaceMembers };
}

const user = { id: 12345, first_name: "Ivan", username: "ivan" };

describe("createContactForUser", () => {
  beforeEach(() => {
    clearOwnerCache();
  });

  // Regression: workspaces that mark Owner required 400'd on every create
  // because the API injects ownerId: null during validation, before applying
  // its own "defaults to the authenticated user" rule.
  it("sends ownerId when the workspace marks it required", async () => {
    const { client, createContact } = mockClient([property("ownerId", true)]);

    await createContactForUser(client, "ws1", user, undefined, undefined);

    expect(createContact).toHaveBeenCalledOnce();
    const [, input] = createContact.mock.calls[0];
    expect(input.ownerId).toBe("u_admin");
  });

  it("omits ownerId when the workspace does not require it", async () => {
    const { client, createContact, listWorkspaceMembers } = mockClient([
      property("ownerId", false),
    ]);

    await createContactForUser(client, "ws1", user, undefined, undefined);

    const [, input] = createContact.mock.calls[0];
    expect(input.ownerId).toBeUndefined();
    expect(listWorkspaceMembers).not.toHaveBeenCalled();
  });

  it("still applies required custom property defaults alongside ownerId", async () => {
    const stage: Property = {
      key: "custom.stage",
      name: "Stage",
      type: "single-select",
      required: true,
      options: [{ label: "Lead", value: "lead" }],
    };
    const { client, createContact } = mockClient([property("ownerId", true), stage]);

    await createContactForUser(client, "ws1", user, undefined, undefined);

    const [, input] = createContact.mock.calls[0];
    expect(input.ownerId).toBe("u_admin");
    expect(input.custom).toEqual({ stage: "lead" });
  });
});
