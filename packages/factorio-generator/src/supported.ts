import type {
  PrototypePropertyChange,
  RecipeIngredientChange,
  TechnologyCostChange,
  TechnologyPrerequisiteChange,
} from "@project/domain";

export interface SupportedPrototypeProperty {
  readonly prototypeType: string;
  readonly prototypeName: string;
  readonly property: string;
  readonly baseValue: number;
}

export interface SupportedRecipeIngredient {
  readonly recipeName: string;
  readonly ingredientType: "item";
  readonly ingredientName: string;
  readonly baseAmount: number;
}

export interface SupportedTechnologyCost {
  readonly technologyName: string;
  readonly baseCount: number;
}

export interface SupportedTechnologyPrerequisite {
  readonly technologyName: string;
  readonly prerequisiteName: string;
  readonly basePresent: boolean;
  readonly allowedOperation: "add" | "remove";
}

const supportedPrototypeProperties = new Map<string, SupportedPrototypeProperty>([
  [
    "furnace\u0000stone-furnace\u0000crafting_speed",
    { prototypeType: "furnace", prototypeName: "stone-furnace", property: "crafting_speed", baseValue: 1 },
  ],
  [
    "furnace\u0000steel-furnace\u0000crafting_speed",
    { prototypeType: "furnace", prototypeName: "steel-furnace", property: "crafting_speed", baseValue: 2 },
  ],
  [
    "furnace\u0000electric-furnace\u0000crafting_speed",
    { prototypeType: "furnace", prototypeName: "electric-furnace", property: "crafting_speed", baseValue: 2 },
  ],
]);

const supportedRecipeIngredients = new Map<string, SupportedRecipeIngredient>([
  [
    "iron-gear-wheel\u0000item\u0000iron-plate",
    { recipeName: "iron-gear-wheel", ingredientType: "item", ingredientName: "iron-plate", baseAmount: 2 },
  ],
  [
    "transport-belt\u0000item\u0000iron-plate",
    { recipeName: "transport-belt", ingredientType: "item", ingredientName: "iron-plate", baseAmount: 1 },
  ],
  [
    "transport-belt\u0000item\u0000iron-gear-wheel",
    { recipeName: "transport-belt", ingredientType: "item", ingredientName: "iron-gear-wheel", baseAmount: 1 },
  ],
  [
    "electronic-circuit\u0000item\u0000iron-plate",
    { recipeName: "electronic-circuit", ingredientType: "item", ingredientName: "iron-plate", baseAmount: 1 },
  ],
  [
    "electronic-circuit\u0000item\u0000copper-cable",
    { recipeName: "electronic-circuit", ingredientType: "item", ingredientName: "copper-cable", baseAmount: 3 },
  ],
  [
    "pipe\u0000item\u0000iron-plate",
    { recipeName: "pipe", ingredientType: "item", ingredientName: "iron-plate", baseAmount: 1 },
  ],
]);

const supportedTechnologyCosts = new Map<string, SupportedTechnologyCost>([
  ["automation", { technologyName: "automation", baseCount: 10 }],
  ["automation-2", { technologyName: "automation-2", baseCount: 40 }],
  ["logistics", { technologyName: "logistics", baseCount: 20 }],
  ["steel-processing", { technologyName: "steel-processing", baseCount: 50 }],
  ["logistic-science-pack", { technologyName: "logistic-science-pack", baseCount: 75 }],
]);

const supportedTechnologyPrerequisites = new Map<string, SupportedTechnologyPrerequisite>([
  [
    "automation-2\u0000steel-processing",
    { technologyName: "automation-2", prerequisiteName: "steel-processing", basePresent: true, allowedOperation: "remove" },
  ],
  [
    "logistics-2\u0000logistics",
    { technologyName: "logistics-2", prerequisiteName: "logistics", basePresent: true, allowedOperation: "remove" },
  ],
  [
    "advanced-material-processing\u0000logistic-science-pack",
    { technologyName: "advanced-material-processing", prerequisiteName: "logistic-science-pack", basePresent: true, allowedOperation: "remove" },
  ],
  [
    "automation-2\u0000logistics",
    { technologyName: "automation-2", prerequisiteName: "logistics", basePresent: false, allowedOperation: "add" },
  ],
  [
    "advanced-material-processing\u0000logistics",
    { technologyName: "advanced-material-processing", prerequisiteName: "logistics", basePresent: false, allowedOperation: "add" },
  ],
]);

function prototypeSupportKey(change: PrototypePropertyChange) {
  return `${change.prototypeType}\u0000${change.prototypeName}\u0000${change.property}`;
}

function recipeSupportKey(change: RecipeIngredientChange) {
  return `${change.recipeName}\u0000${change.ingredientType}\u0000${change.ingredientName}`;
}

export function getSupportedPrototypeProperty(
  change: PrototypePropertyChange,
): SupportedPrototypeProperty {
  const supported = supportedPrototypeProperties.get(prototypeSupportKey(change));
  if (!supported) {
    throw new Error(
      `Unsupported prototype property: ${change.prototypeType}.${change.prototypeName}.${change.property}`,
    );
  }
  return supported;
}

export function assertSupportedPrototypeProperty(change: PrototypePropertyChange): void {
  getSupportedPrototypeProperty(change);
}

export function getSupportedRecipeIngredient(
  change: RecipeIngredientChange,
): SupportedRecipeIngredient {
  const supported = supportedRecipeIngredients.get(recipeSupportKey(change));
  if (!supported) {
    throw new Error(
      `Unsupported recipe ingredient: ${change.recipeName}.${change.ingredientType}.${change.ingredientName}`,
    );
  }
  return supported;
}

export function assertSupportedRecipeIngredient(change: RecipeIngredientChange): void {
  getSupportedRecipeIngredient(change);
}

export function getSupportedTechnologyCost(
  change: TechnologyCostChange,
): SupportedTechnologyCost {
  const supported = supportedTechnologyCosts.get(change.technologyName);
  if (!supported) {
    throw new Error(`Unsupported technology cost: ${change.technologyName}`);
  }
  return supported;
}

export function assertSupportedTechnologyCost(change: TechnologyCostChange): void {
  getSupportedTechnologyCost(change);
}

export function getSupportedTechnologyPrerequisite(
  change: TechnologyPrerequisiteChange,
): SupportedTechnologyPrerequisite {
  const key = `${change.technologyName}\u0000${change.prerequisiteName}`;
  const supported = supportedTechnologyPrerequisites.get(key);
  if (!supported || supported.allowedOperation !== change.operation.type) {
    throw new Error(
      `Unsupported technology prerequisite change: ${change.technologyName}.${change.operation.type}.${change.prerequisiteName}`,
    );
  }
  return supported;
}

export function assertSupportedTechnologyPrerequisite(
  change: TechnologyPrerequisiteChange,
): void {
  getSupportedTechnologyPrerequisite(change);
}
