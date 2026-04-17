import { describe, it, expect } from "vitest";
import { findDefaultStageMapping } from "./default-mapping.js";
import type { Property } from "../api/types.js";

function stageProp(options: Array<{ label: string; value: string }>): Property {
  return {
    key: "custom.stage",
    name: "Stage",
    type: "single-select",
    required: false,
    options,
  };
}

describe("findDefaultStageMapping", () => {
  it("returns mapping when Lead and Closed are present in the same property", () => {
    const props: Property[] = [
      stageProp([
        { label: "Lead", value: "lead" },
        { label: "Qualified", value: "qualified" },
        { label: "Negotiation", value: "negotiation" },
        { label: "Won", value: "won" },
        { label: "Closed", value: "closed" },
      ]),
    ];

    const mapping = findDefaultStageMapping(props);

    expect(mapping).toEqual({
      propertyKey: "custom.stage",
      propertyName: "Stage",
      joinValue: "lead",
      joinLabel: "Lead",
      leaveValue: "closed",
      leaveLabel: "Closed",
    });
  });

  it("matches case-insensitively and trims whitespace", () => {
    const props: Property[] = [
      stageProp([
        { label: " LEAD ", value: "v1" },
        { label: "closed", value: "v2" },
      ]),
    ];

    const mapping = findDefaultStageMapping(props);

    expect(mapping?.joinValue).toBe("v1");
    expect(mapping?.leaveValue).toBe("v2");
  });

  it("falls back to Russian labels", () => {
    const props: Property[] = [
      stageProp([
        { label: "Лид", value: "ru_lead" },
        { label: "Закрыто", value: "ru_closed" },
      ]),
    ];

    const mapping = findDefaultStageMapping(props);

    expect(mapping?.joinValue).toBe("ru_lead");
    expect(mapping?.leaveValue).toBe("ru_closed");
  });

  it("returns undefined when only one of Lead / Closed exists", () => {
    const props: Property[] = [
      stageProp([
        { label: "Lead", value: "lead" },
        { label: "Won", value: "won" },
      ]),
    ];

    expect(findDefaultStageMapping(props)).toBeUndefined();
  });

  it("ignores non-single-select properties", () => {
    const props: Property[] = [
      {
        key: "custom.notes",
        name: "Notes",
        type: "text",
        required: false,
      },
      stageProp([
        { label: "Lead", value: "lead" },
        { label: "Closed", value: "closed" },
      ]),
    ];

    const mapping = findDefaultStageMapping(props);
    expect(mapping?.propertyKey).toBe("custom.stage");
  });

  it("returns undefined for empty or non-stage workspaces", () => {
    expect(findDefaultStageMapping([])).toBeUndefined();
    expect(
      findDefaultStageMapping([
        stageProp([
          { label: "New", value: "new" },
          { label: "Won", value: "won" },
        ]),
      ]),
    ).toBeUndefined();
  });
});
