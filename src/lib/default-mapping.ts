import type { Property } from "../api/types.js";
import type { PropertyMapping } from "../config/types.js";

// Default CRMChat workspaces are seeded with a single-select "Stage" property
// containing 5 options including "Lead" and "Closed". When the bot is added
// to a new channel, pre-fill the property mapping using these stages so the
// channel works out of the box without forcing the user through /settings.
//
// We match on the human-readable option label (case-insensitive, trimmed).
// Russian fallbacks cover RU-localized workspaces.

const JOIN_LABELS = new Set(["lead", "лид"]);
const LEAVE_LABELS = new Set(["closed", "закрыто", "закрыт"]);

function normalize(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Scan workspace properties and return a default join/leave mapping if a
 * single-select property contains both a "Lead" and a "Closed" option.
 * Returns undefined when no match is found (e.g. workspace has been
 * customized) so the caller can leave the mapping unset.
 */
export function findDefaultStageMapping(
  properties: Property[],
): PropertyMapping | undefined {
  for (const prop of properties) {
    if (prop.type !== "single-select") continue;
    if (!prop.options || prop.options.length === 0) continue;

    const lead = prop.options.find((o) => JOIN_LABELS.has(normalize(o.label)));
    const closed = prop.options.find((o) => LEAVE_LABELS.has(normalize(o.label)));
    if (!lead || !closed) continue;

    return {
      propertyKey: prop.key,
      propertyName: prop.name,
      joinValue: lead.value,
      joinLabel: lead.label,
      leaveValue: closed.value,
      leaveLabel: closed.label,
    };
  }
  return undefined;
}
