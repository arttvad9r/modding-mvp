import type { ModChange } from "@project/domain";

export interface BroadScopeIssue {
  readonly reason: string;
}

const universalQuantifier = /\b(?:all|every|each|entire|whole)\b/i;

interface CategoryRule {
  readonly label: string;
  readonly broadPattern: RegExp;
  readonly specificPattern?: RegExp;
  readonly changeTypes: readonly ModChange["type"][];
}

const categoryRules: readonly CategoryRule[] = [
  {
    label: "furnaces",
    broadPattern: /\bfurnaces\b/i,
    specificPattern: /\b(?:stone|steel|electric) furnaces?\b/i,
    changeTypes: ["prototype_property"],
  },
  {
    label: "assembling machines",
    broadPattern: /\b(?:assemblers|assembling machines)\b/i,
    specificPattern: /\b(?:assembler|assembling machine)\s*[123]\b/i,
    changeTypes: ["prototype_property"],
  },
  {
    label: "mining drills",
    broadPattern: /\bmining drills\b/i,
    specificPattern: /\b(?:burner|electric) mining drills?\b/i,
    changeTypes: ["prototype_property"],
  },
  {
    label: "transport belts",
    broadPattern: /\b(?:transport )?belts\b/i,
    specificPattern: /\b(?:basic|fast|express) (?:transport )?belts?\b/i,
    changeTypes: ["prototype_property"],
  },
  {
    label: "inserters",
    broadPattern: /\binserters\b/i,
    specificPattern: /\b(?:burner|fast|bulk|long[- ]handed) inserters?\b/i,
    changeTypes: ["prototype_property"],
  },
  { label: "labs", broadPattern: /\blabs\b/i, changeTypes: ["prototype_property"] },
  {
    label: "recipes",
    broadPattern: /\brecipes\b/i,
    specificPattern: /\b(?:iron gears?|gear wheels?|transport belts?|electronic circuits?|green circuits?|pipes?)\b/i,
    changeTypes: ["recipe_ingredient", "recipe_crafting_time", "recipe_result"],
  },
  {
    label: "items",
    broadPattern: /\bitems\b/i,
    specificPattern: /\b(?:iron plates?|copper plates?|iron gears?|electronic circuits?|green circuits?|pipes?|transport belts?)\b/i,
    changeTypes: ["item_stack_size"],
  },
  {
    label: "technologies",
    broadPattern: /\btechnologies\b/i,
    specificPattern: /\b(?:automation(?: 2)?|logistics|steel processing|logistic science pack)\b/i,
    changeTypes: ["technology_cost", "technology_prerequisite"],
  },
];

/**
 * Conservative beta guard for broad natural-language scopes.
 *
 * The capability registry proves that individual addresses are reviewed; it does not prove
 * that an allow-list contains every member of a human category such as "all inserters".
 * Until a category has an explicit completeness contract, broad/category wording is rejected
 * instead of being interpreted as "all currently allow-listed members".
 */
export function findBroadScopeIssue(
  prompt: string,
  changes: readonly ModChange[] = [],
): BroadScopeIssue | null {
  const trimmed = prompt.trim();
  if (!trimmed) return null;

  for (const rule of categoryRules) {
    if (!rule.broadPattern.test(trimmed)) continue;
    const universal = universalQuantifier.test(trimmed);

    // Before model output is available, explicit all/every/each category wording is enough
    // to reject without spending an LLM call.
    if (changes.length === 0) {
      if (!universal) continue;
      return {
        reason: `Broad category request for ${rule.label} is not supported safely yet. Name the exact targets you want changed so the beta cannot silently apply only the reviewed subset.`,
      };
    }

    const relevant = changes.filter((change) => rule.changeTypes.includes(change.type));
    if (relevant.length === 0) continue;
    const explicitlySpecific = rule.specificPattern?.test(trimmed) ?? false;
    if (!universal && explicitlySpecific) continue;

    return {
      reason: `Broad category request for ${rule.label} is not supported safely yet. Name the exact targets you want changed so the beta cannot silently apply only the reviewed subset.`,
    };
  }

  return null;
}
