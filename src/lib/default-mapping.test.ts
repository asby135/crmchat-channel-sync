import { describe, it, expect } from "vitest";
import { findDefaultStageMapping } from "./default-mapping.js";
import type { Property } from "../api/types.js";

function stageProp(
  options: Array<{ label: string; value: string }>,
  overrides: Partial<Property> = {},
): Property {
  return {
    key: "custom.stage",
    name: "Stage",
    type: "single-select",
    required: false,
    options,
    ...overrides,
  };
}

describe("findDefaultStageMapping", () => {
  it("uses first option for joins and last option for leaves", () => {
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

  it("works on non-English / customized labels (no exact-name search)", () => {
    const props: Property[] = [
      stageProp([
        { label: "Новый интерес", value: "new" },
        { label: "В работе", value: "wip" },
        { label: "Отписался", value: "churned" },
      ]),
    ];

    const mapping = findDefaultStageMapping(props);

    expect(mapping?.joinLabel).toBe("Новый интерес");
    expect(mapping?.leaveLabel).toBe("Отписался");
  });

  it("returns undefined when only one option exists", () => {
    const props: Property[] = [stageProp([{ label: "Lead", value: "lead" }])];
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
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ]),
    ];
    expect(findDefaultStageMapping(props)?.propertyKey).toBe("custom.stage");
  });

  it("ignores built-in (non-custom) properties", () => {
    // Built-ins are system-managed; only consider custom.* like /settings does.
    const props: Property[] = [
      stageProp(
        [
          { label: "Open", value: "o" },
          { label: "Closed", value: "c" },
        ],
        { key: "status", name: "Status" },
      ),
      stageProp(
        [
          { label: "First", value: "f" },
          { label: "Last", value: "l" },
        ],
        { key: "custom.pipeline", name: "Pipeline" },
      ),
    ];

    const mapping = findDefaultStageMapping(props);
    expect(mapping?.propertyKey).toBe("custom.pipeline");
  });

  it("picks the first eligible custom single-select when several exist", () => {
    const props: Property[] = [
      stageProp(
        [
          { label: "A1", value: "a1" },
          { label: "A2", value: "a2" },
        ],
        { key: "custom.first", name: "First" },
      ),
      stageProp(
        [
          { label: "B1", value: "b1" },
          { label: "B2", value: "b2" },
        ],
        { key: "custom.second", name: "Second" },
      ),
    ];

    expect(findDefaultStageMapping(props)?.propertyKey).toBe("custom.first");
  });

  it("returns undefined for empty workspaces", () => {
    expect(findDefaultStageMapping([])).toBeUndefined();
  });
});
