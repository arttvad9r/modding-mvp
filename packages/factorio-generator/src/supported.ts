import type {
  PrototypePropertyChange,
  RecipeIngredientChange,
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
