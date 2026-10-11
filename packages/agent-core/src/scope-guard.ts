import type { ModChange } from "@project/domain";

export interface BroadScopeIssue {
  readonly reason: string;
}

const universalQuantifier = /(?:\b(?:all|every|each|entire|whole)\b|(?:^|[\s,.;:!?])(?:все|всё|вся|весь|каждый|каждая|каждое|каждые|целиком)(?=$|[\s,.;:!?]))/iu;

interface CategoryRule {
  readonly label: string;
  readonly labelRu: string;
  readonly broadPattern: RegExp;
  readonly specificPattern?: RegExp;
  readonly changeTypes: readonly ModChange["type"][];
}

const categoryRules: readonly CategoryRule[] = [
  {
    label: "furnaces",
    labelRu: "печи",
    broadPattern: /(?:\bfurnaces\b|печ(?:ь|и|ей))/iu,
    specificPattern: /(?:\b(?:stone|steel|electric) furnaces?\b|(?:каменн\p{L}*|стальн\p{L}*|электрическ\p{L}*)\s+печ(?:ь|и))/iu,
    changeTypes: ["prototype_property"],
  },
  {
    label: "assembling machines",
    labelRu: "сборочные автоматы",
    broadPattern: /(?:\b(?:assemblers|assembling machines)\b|сборочн\p{L}*\s+(?:автомат\p{L}*|машин\p{L}*))/iu,
    specificPattern: /(?:\b(?:assembler|assembling machine)\s*[123]\b|сборочн\p{L}*\s+(?:автомат\p{L}*|машин\p{L}*)\s*[123])/iu,
    changeTypes: ["prototype_property"],
  },
  {
    label: "mining drills",
    labelRu: "добывающие буры",
    broadPattern: /(?:\bmining drills\b|(?:бур(?:ы|ов)?|добывающ\p{L}*\s+бур\p{L}*))/iu,
    specificPattern: /(?:\b(?:burner|electric) mining drills?\b|(?:твердотопливн\p{L}*|электрическ\p{L}*)\s+бур\p{L}*)/iu,
    changeTypes: ["prototype_property"],
  },
  {
    label: "transport belts",
    labelRu: "конвейеры",
    broadPattern: /(?:\b(?:transport )?belts\b|(?:конвейер(?:ы|ов)?|транспортн\p{L}*\s+лент\p{L}*))/iu,
    specificPattern: /(?:\b(?:basic|fast|express) (?:transport )?belts?\b|(?:обычн\p{L}*|желт\p{L}*|быстр\p{L}*|красн\p{L}*|экспресс\p{L}*|син\p{L}*)\s+(?:конвейер\p{L}*|транспортн\p{L}*\s+лент\p{L}*))/iu,
    changeTypes: ["prototype_property"],
  },
  {
    label: "inserters",
    labelRu: "манипуляторы",
    broadPattern: /(?:\binserters\b|манипулятор(?:ы|ов)?)/iu,
    specificPattern: /(?:\b(?:burner|fast|bulk|long[- ]handed) inserters?\b|(?:обычн\p{L}*|быстр\p{L}*|пакетн\p{L}*|длинн\p{L}*|твердотопливн\p{L}*)\s+манипулятор\p{L}*)/iu,
    changeTypes: ["prototype_property"],
  },
  { label: "labs", labelRu: "лаборатории", broadPattern: /(?:\blabs\b|лаборатори(?:я|и|й))/iu, specificPattern: /(?:\blab\b|лаборатори(?:я|и))/iu, changeTypes: ["prototype_property"] },
  {
    label: "recipes",
    labelRu: "рецепты",
    broadPattern: /(?:\brecipes\b|рецепты|рецептов)/iu,
    specificPattern: /(?:\b(?:iron gears?|gear wheels?|transport belts?|electronic circuits?|green circuits?|pipes?)\b|(?:железн\p{L}*\s+шестерн\p{L}*|конвейер\p{L}*|электронн\p{L}*\s+схем\p{L}*|зелён\p{L}*\s+схем\p{L}*|зелен\p{L}*\s+схем\p{L}*|труб\p{L}*))/iu,
    changeTypes: ["recipe_ingredient", "recipe_crafting_time", "recipe_result", "new_recipe"],
  },
  {
    label: "items",
    labelRu: "предметы",
    broadPattern: /(?:\bitems\b|предметы|предметов)/iu,
    specificPattern: /(?:\b(?:iron plates?|copper plates?|iron gears?|electronic circuits?|green circuits?|pipes?|transport belts?)\b|(?:железн\p{L}*\s+пластин\p{L}*|медн\p{L}*\s+пластин\p{L}*|железн\p{L}*\s+шестерн\p{L}*|электронн\p{L}*\s+схем\p{L}*|зелён\p{L}*\s+схем\p{L}*|зелен\p{L}*\s+схем\p{L}*|труб\p{L}*|конвейер\p{L}*))/iu,
    changeTypes: ["item_stack_size", "new_item"],
  },
  {
    label: "technologies",
    labelRu: "технологии",
    broadPattern: /(?:\btechnologies\b|технологии|технологий)/iu,
    specificPattern: /(?:\b(?:automation(?: 2)?|logistics|steel processing|logistic science pack)\b|(?:автоматизаци\p{L}*|логистик\p{L}*|обработк\p{L}*\s+стали|логистическ\p{L}*\s+научн\p{L}*\s+пакет\p{L}*))/iu,
    changeTypes: ["technology_cost", "technology_prerequisite"],
  },
];


function broadScopeReason(rule: CategoryRule, prompt: string): string {
  if (/[А-Яа-яЁё]/u.test(prompt)) {
    return `Широкий запрос на категорию «${rule.labelRu}» пока нельзя выполнить безопасно. Назови конкретные цели, чтобы бета не применила только поддерживаемую часть и не выдала это за полный результат.`;
  }
  return `Broad category request for ${rule.label} is not supported safely yet. Name the exact targets you want changed so the beta cannot silently apply only the reviewed subset.`;
}

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
        reason: broadScopeReason(rule, trimmed),
      };
    }

    const relevant = changes.filter((change) => rule.changeTypes.includes(change.type));
    if (relevant.length === 0) continue;
    const explicitlySpecific = rule.specificPattern?.test(trimmed) ?? false;
    if (!universal && explicitlySpecific) continue;

    return {
      reason: broadScopeReason(rule, trimmed),
    };
  }

  return null;
}
