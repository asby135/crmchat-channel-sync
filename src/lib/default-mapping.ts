import type { Property } from "../api/types.js";
import type { PropertyMapping } from "../config/types.js";

// Default CRMChat workspaces are seeded with a single-select pipeline
// property (5 stages by default). When the bot is added to a new channel,
// pre-fill the property mapping using the first and last option of that
// pipeline so the channel works out of the box without forcing the user
// through /settings.
//
// We pick the first custom single-select property with at least 2 options.
// First option = "where fresh leads land", last option = "closed/done".
// This avoids hard-coding labels (works on customized or non-English
// workspaces) at the cost of being wrong if the user has reordered their
// pipeline. Easy fix: open /settings and reconfigure.

/**
 * Scan workspace properties and return a default join/leave mapping based
 * on the first usable custom single-select. Returns undefined when no
 * single-select custom property with ≥2 options exists.
 */
export function findDefaultStageMapping(
  properties: Property[],
): PropertyMapping | undefined {
  for (const prop of properties) {
    if (!prop.key.startsWith("custom.")) continue;
    if (prop.type !== "single-select") continue;
    if (!prop.options || prop.options.length < 2) continue;

    const first = prop.options[0];
    const last = prop.options[prop.options.length - 1];

    return {
      propertyKey: prop.key,
      propertyName: prop.name,
      joinValue: first.value,
      joinLabel: first.label,
      leaveValue: last.value,
      leaveLabel: last.label,
    };
  }
  return undefined;
}
