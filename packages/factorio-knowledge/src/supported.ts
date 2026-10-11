import {
  ProjectError,
  type PrototypePropertyChange,
  RecipeIngredientChange,
  RecipeCraftingTimeChange,
  RecipeResultChange,
  ItemStackSizeChange,
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

export interface SupportedRecipeCraftingTime {
  readonly recipeName: string;
  readonly baseEnergyRequired: number;
}

export interface SupportedRecipeResult {
  readonly recipeName: string;
  readonly resultType: "item";
  readonly resultName: string;
  readonly baseAmount: number;
}

export interface SupportedItemStackSize {
  readonly itemName: string;
  readonly baseStackSize: number;
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
  [
    "assembling-machine\u0000assembling-machine-1\u0000crafting_speed",
    { prototypeType: "assembling-machine", prototypeName: "assembling-machine-1", property: "crafting_speed", baseValue: 0.5 },
  ],
  [
    "assembling-machine\u0000assembling-machine-2\u0000crafting_speed",
    { prototypeType: "assembling-machine", prototypeName: "assembling-machine-2", property: "crafting_speed", baseValue: 0.75 },
  ],
  [
    "assembling-machine\u0000assembling-machine-3\u0000crafting_speed",
    { prototypeType: "assembling-machine", prototypeName: "assembling-machine-3", property: "crafting_speed", baseValue: 1.25 },
  ],
  [
    "mining-drill\u0000burner-mining-drill\u0000mining_speed",
    { prototypeType: "mining-drill", prototypeName: "burner-mining-drill", property: "mining_speed", baseValue: 0.25 },
  ],
  [
    "mining-drill\u0000electric-mining-drill\u0000mining_speed",
    { prototypeType: "mining-drill", prototypeName: "electric-mining-drill", property: "mining_speed", baseValue: 0.5 },
  ],
  [
    "transport-belt\u0000transport-belt\u0000speed",
    { prototypeType: "transport-belt", prototypeName: "transport-belt", property: "speed", baseValue: 0.03125 },
  ],
  [
    "transport-belt\u0000fast-transport-belt\u0000speed",
    { prototypeType: "transport-belt", prototypeName: "fast-transport-belt", property: "speed", baseValue: 0.0625 },
  ],
  [
    "transport-belt\u0000express-transport-belt\u0000speed",
    { prototypeType: "transport-belt", prototypeName: "express-transport-belt", property: "speed", baseValue: 0.09375 },
  ],
  [
    "inserter\u0000inserter\u0000extension_speed",
    { prototypeType: "inserter", prototypeName: "inserter", property: "extension_speed", baseValue: 0.035 },
  ],
  [
    "inserter\u0000inserter\u0000rotation_speed",
    { prototypeType: "inserter", prototypeName: "inserter", property: "rotation_speed", baseValue: 0.014 },
  ],
  [
    "inserter\u0000fast-inserter\u0000extension_speed",
    { prototypeType: "inserter", prototypeName: "fast-inserter", property: "extension_speed", baseValue: 0.1 },
  ],
  [
    "inserter\u0000fast-inserter\u0000rotation_speed",
    { prototypeType: "inserter", prototypeName: "fast-inserter", property: "rotation_speed", baseValue: 0.04 },
  ],
  [
    "inserter\u0000bulk-inserter\u0000extension_speed",
    { prototypeType: "inserter", prototypeName: "bulk-inserter", property: "extension_speed", baseValue: 0.1 },
  ],
  [
    "inserter\u0000bulk-inserter\u0000rotation_speed",
    { prototypeType: "inserter", prototypeName: "bulk-inserter", property: "rotation_speed", baseValue: 0.04 },
  ],
  [
    "lab\u0000lab\u0000researching_speed",
    { prototypeType: "lab", prototypeName: "lab", property: "researching_speed", baseValue: 1 },
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

const supportedRecipeCraftingTimes = new Map<string, SupportedRecipeCraftingTime>([
  ["iron-gear-wheel", { recipeName: "iron-gear-wheel", baseEnergyRequired: 0.5 }],
  ["transport-belt", { recipeName: "transport-belt", baseEnergyRequired: 0.5 }],
  ["electronic-circuit", { recipeName: "electronic-circuit", baseEnergyRequired: 0.5 }],
  ["pipe", { recipeName: "pipe", baseEnergyRequired: 0.5 }],
]);

const supportedRecipeResults = new Map<string, SupportedRecipeResult>([
  ["iron-gear-wheel\u0000item\u0000iron-gear-wheel", { recipeName: "iron-gear-wheel", resultType: "item", resultName: "iron-gear-wheel", baseAmount: 1 }],
  ["transport-belt\u0000item\u0000transport-belt", { recipeName: "transport-belt", resultType: "item", resultName: "transport-belt", baseAmount: 2 }],
  ["electronic-circuit\u0000item\u0000electronic-circuit", { recipeName: "electronic-circuit", resultType: "item", resultName: "electronic-circuit", baseAmount: 1 }],
  ["pipe\u0000item\u0000pipe", { recipeName: "pipe", resultType: "item", resultName: "pipe", baseAmount: 1 }],
]);

const supportedItemStackSizes = new Map<string, SupportedItemStackSize>([
  ["iron-plate", { itemName: "iron-plate", baseStackSize: 100 }],
  ["copper-plate", { itemName: "copper-plate", baseStackSize: 100 }],
  ["iron-gear-wheel", { itemName: "iron-gear-wheel", baseStackSize: 100 }],
  ["electronic-circuit", { itemName: "electronic-circuit", baseStackSize: 200 }],
  ["pipe", { itemName: "pipe", baseStackSize: 100 }],
  ["transport-belt", { itemName: "transport-belt", baseStackSize: 100 }],
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

function recipeResultSupportKey(change: RecipeResultChange) {
  return `${change.recipeName}\u0000${change.resultType}\u0000${change.resultName}`;
}

export function getSupportedPrototypeProperty(
  change: PrototypePropertyChange,
): SupportedPrototypeProperty {
  const supported = supportedPrototypeProperties.get(prototypeSupportKey(change));
  if (!supported) {
    throw new ProjectError({
      code: "unsupported_capability",
      stage: "generation",
      message: `Unsupported prototype property: ${change.prototypeType}.${change.prototypeName}.${change.property}`,
      details: { capability: "prototype_property" },
    });
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
    throw new ProjectError({
      code: "unsupported_capability",
      stage: "generation",
      message: `Unsupported recipe ingredient: ${change.recipeName}.${change.ingredientType}.${change.ingredientName}`,
      details: { capability: "recipe_ingredient" },
    });
  }
  return supported;
}

export function assertSupportedRecipeIngredient(change: RecipeIngredientChange): void {
  getSupportedRecipeIngredient(change);
}

export function getSupportedRecipeCraftingTime(
  change: RecipeCraftingTimeChange,
): SupportedRecipeCraftingTime {
  const supported = supportedRecipeCraftingTimes.get(change.recipeName);
  if (!supported) {
    throw new ProjectError({ code: "unsupported_capability", stage: "generation", message: `Unsupported recipe crafting time: ${change.recipeName}`, details: { capability: "recipe_crafting_time" } });
  }
  return supported;
}

export function assertSupportedRecipeCraftingTime(change: RecipeCraftingTimeChange): void {
  getSupportedRecipeCraftingTime(change);
}

export function getSupportedRecipeResult(change: RecipeResultChange): SupportedRecipeResult {
  const supported = supportedRecipeResults.get(recipeResultSupportKey(change));
  if (!supported) {
    throw new ProjectError({ code: "unsupported_capability", stage: "generation", message: `Unsupported recipe result: ${change.recipeName}.${change.resultType}.${change.resultName}`, details: { capability: "recipe_result" } });
  }
  return supported;
}

export function assertSupportedRecipeResult(change: RecipeResultChange): void {
  getSupportedRecipeResult(change);
}

export function getSupportedItemStackSize(change: ItemStackSizeChange): SupportedItemStackSize {
  const supported = supportedItemStackSizes.get(change.itemName);
  if (!supported) {
    throw new ProjectError({ code: "unsupported_capability", stage: "generation", message: `Unsupported item stack size: ${change.itemName}`, details: { capability: "item_stack_size" } });
  }
  return supported;
}

export function assertSupportedItemStackSize(change: ItemStackSizeChange): void {
  getSupportedItemStackSize(change);
}

export function getSupportedTechnologyCost(
  change: TechnologyCostChange,
): SupportedTechnologyCost {
  const supported = supportedTechnologyCosts.get(change.technologyName);
  if (!supported) {
    throw new ProjectError({
      code: "unsupported_capability",
      stage: "generation",
      message: `Unsupported technology cost: ${change.technologyName}`,
      details: { capability: "technology_cost" },
    });
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
    throw new ProjectError({
      code: "unsupported_capability",
      stage: "generation",
      message: `Unsupported technology prerequisite change: ${change.technologyName}.${change.operation.type}.${change.prerequisiteName}`,
      details: { capability: "technology_prerequisite" },
    });
  }
  return supported;
}

export function assertSupportedTechnologyPrerequisite(
  change: TechnologyPrerequisiteChange,
): void {
  getSupportedTechnologyPrerequisite(change);
}

export function listSupportedPrototypeProperties(): readonly SupportedPrototypeProperty[] {
  return [...supportedPrototypeProperties.values()];
}

export function listSupportedRecipeIngredients(): readonly SupportedRecipeIngredient[] {
  return [...supportedRecipeIngredients.values()];
}

export function listSupportedRecipeCraftingTimes(): readonly SupportedRecipeCraftingTime[] {
  return [...supportedRecipeCraftingTimes.values()];
}

export function listSupportedRecipeResults(): readonly SupportedRecipeResult[] {
  return [...supportedRecipeResults.values()];
}

export function listSupportedItemStackSizes(): readonly SupportedItemStackSize[] {
  return [...supportedItemStackSizes.values()];
}

export function listSupportedTechnologyCosts(): readonly SupportedTechnologyCost[] {
  return [...supportedTechnologyCosts.values()];
}

export function listSupportedTechnologyPrerequisites(): readonly SupportedTechnologyPrerequisite[] {
  return [...supportedTechnologyPrerequisites.values()];
}
