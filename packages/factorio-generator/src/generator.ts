import {
  GeneratedFileManifestSchema,
  ModSpecSchema,
  type GeneratedFileManifest,
  type ModSpec,
  type PrototypePropertyAssertion,
  type PrototypePropertyChange,
  type RecipeIngredientAssertion,
  type RecipeIngredientChange,
  type ScalarOperation,
} from "@project/domain";

import {
  assertSupportedPrototypeProperty,
  assertSupportedRecipeIngredient,
  getSupportedPrototypeProperty,
  getSupportedRecipeIngredient,
} from "./supported.js";

const GENERATED_VERSION = "0.1.0";
const GENERATED_AUTHOR = "Generated mod";
const SEMANTIC_MARKER = "__PROJECT_SEMANTIC_ASSERTION__";
const MAX_ITEM_INGREDIENT_AMOUNT = 65_535;
const safeLuaIdentifier = /^[A-Za-z0-9_-]+$/;
const safeLuaProperty = /^[A-Za-z_][A-Za-z0-9_]*$/;
const controlCharacter = /[\u0000-\u001f\u007f]/;

export interface GeneratedFactorioMod {
  readonly name: string;
  readonly version: string;
  readonly directoryName: string;
  readonly manifest: GeneratedFileManifest;
  readonly semanticAssertionLua: string;
}

function quoteLuaText(value: string): string {
  if (controlCharacter.test(value)) {
    throw new Error("Lua strings must not contain control characters");
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function quoteLuaIdentifier(value: string, kind: "identifier" | "property"): string {
  const pattern = kind === "identifier" ? safeLuaIdentifier : safeLuaProperty;
  if (!pattern.test(value)) {
    throw new Error(`Unsafe Lua ${kind}: ${value}`);
  }
  return quoteLuaText(value);
}

function luaNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot render a non-finite Lua number");
  }
  return Object.is(value, -0) ? "0" : String(value);
}

function applyOperation(operation: ScalarOperation, baseValue: number): number {
  const value = operation.type === "set" ? operation.value : baseValue * operation.factor;
  if (!Number.isFinite(value)) {
    throw new Error("Semantic expectation must be finite");
  }
  return value;
}

function renderOperation(operation: ScalarOperation, currentExpression: string): string {
  return operation.type === "set"
    ? luaNumber(operation.value)
    : `${currentExpression} * ${luaNumber(operation.factor)}`;
}

function expectedItemIngredientAmount(operation: ScalarOperation, baseAmount: number): number {
  const expected = applyOperation(operation, baseAmount);
  if (!Number.isInteger(expected) || expected < 1 || expected > MAX_ITEM_INGREDIENT_AMOUNT) {
    throw new Error(
      `Item ingredient amount must be an integer in range 1..${MAX_ITEM_INGREDIENT_AMOUNT}; got ${expected}`,
    );
  }
  return expected;
}

function renderPrototypePropertyChange(change: PrototypePropertyChange): string {
  assertSupportedPrototypeProperty(change);

  const type = quoteLuaIdentifier(change.prototypeType, "identifier");
  const name = quoteLuaIdentifier(change.prototypeName, "identifier");
  const property = quoteLuaIdentifier(change.property, "property");
  const propertyExpression = `prototype[${property}]`;
  const missingMessage = quoteLuaText(`Missing prototype ${change.prototypeType}.${change.prototypeName}`);
  const nonNumericMessage = quoteLuaText(
    `Expected numeric property ${change.prototypeType}.${change.prototypeName}.${change.property}`,
  );

  return [
    "do",
    `  local prototype = data.raw[${type}] and data.raw[${type}][${name}]`,
    `  assert(prototype, ${missingMessage})`,
    `  assert(type(${propertyExpression}) == \"number\", ${nonNumericMessage})`,
    `  ${propertyExpression} = ${renderOperation(change.operation, propertyExpression)}`,
    "end",
  ].join("\n");
}

function renderRecipeIngredientChange(change: RecipeIngredientChange): string {
  const supported = getSupportedRecipeIngredient(change);
  expectedItemIngredientAmount(change.operation, supported.baseAmount);

  const recipeName = quoteLuaIdentifier(change.recipeName, "identifier");
  const ingredientName = quoteLuaIdentifier(change.ingredientName, "identifier");
  const missingRecipe = quoteLuaText(`Missing recipe ${change.recipeName}`);
  const missingIngredient = quoteLuaText(
    `Missing ingredient ${change.ingredientType}.${change.ingredientName} in recipe ${change.recipeName}`,
  );
  const nonNumeric = quoteLuaText(
    `Expected numeric ingredient amount ${change.recipeName}.${change.ingredientType}.${change.ingredientName}`,
  );

  return [
    "do",
    `  local recipe = data.raw[\"recipe\"] and data.raw[\"recipe\"][${recipeName}]`,
    `  assert(recipe, ${missingRecipe})`,
    "  local ingredient = nil",
    "  for _, candidate in ipairs(recipe.ingredients or {}) do",
    `    if candidate.type == \"item\" and candidate.name == ${ingredientName} then`,
    "      ingredient = candidate",
    "      break",
    "    end",
    "  end",
    `  assert(ingredient, ${missingIngredient})`,
    `  assert(type(ingredient.amount) == \"number\", ${nonNumeric})`,
    `  ingredient.amount = ${renderOperation(change.operation, "ingredient.amount")}`,
    "end",
  ].join("\n");
}

function renderPrototypePropertyAssertion(assertion: PrototypePropertyAssertion): string {
  const supported = getSupportedPrototypeProperty({
    type: "prototype_property",
    prototypeType: assertion.prototypeType,
    prototypeName: assertion.prototypeName,
    property: assertion.property,
    operation: assertion.expectation,
  });
  const expected = applyOperation(assertion.expectation, supported.baseValue);
  const type = quoteLuaIdentifier(assertion.prototypeType, "identifier");
  const name = quoteLuaIdentifier(assertion.prototypeName, "identifier");
  const property = quoteLuaIdentifier(assertion.property, "property");
  const address = `${assertion.prototypeType}.${assertion.prototypeName}.${assertion.property}`;
  const markerPrefix = quoteLuaText(`${SEMANTIC_MARKER}|${address}|expected=${expected}|actual=`);

  return [
    "do",
    `  local prototype = data.raw[${type}] and data.raw[${type}][${name}]`,
    `  local actual = prototype and prototype[${property}] or nil`,
    `  local expected = ${luaNumber(expected)}`,
    "  local tolerance = 1e-9 * math.max(1, math.abs(expected))",
    "  if type(actual) ~= \"number\" or math.abs(actual - expected) > tolerance then",
    `    error(${markerPrefix} .. tostring(actual), 0)`,
    "  end",
    "end",
  ].join("\n");
}

function renderRecipeIngredientAssertion(assertion: RecipeIngredientAssertion): string {
  const supported = getSupportedRecipeIngredient({
    type: "recipe_ingredient",
    recipeName: assertion.recipeName,
    ingredientType: assertion.ingredientType,
    ingredientName: assertion.ingredientName,
    operation: assertion.expectation,
  });
  const expected = expectedItemIngredientAmount(assertion.expectation, supported.baseAmount);
  const recipeName = quoteLuaIdentifier(assertion.recipeName, "identifier");
  const ingredientName = quoteLuaIdentifier(assertion.ingredientName, "identifier");
  const address = `recipe.${assertion.recipeName}.ingredient.${assertion.ingredientType}.${assertion.ingredientName}`;
  const markerPrefix = quoteLuaText(`${SEMANTIC_MARKER}|${address}|expected=${expected}|actual=`);

  return [
    "do",
    `  local recipe = data.raw[\"recipe\"] and data.raw[\"recipe\"][${recipeName}]`,
    "  local actual = nil",
    "  if recipe then",
    "    for _, ingredient in ipairs(recipe.ingredients or {}) do",
    `      if ingredient.type == \"item\" and ingredient.name == ${ingredientName} then`,
    "        actual = ingredient.amount",
    "        break",
    "      end",
    "    end",
    "  end",
    `  local expected = ${luaNumber(expected)}`,
    "  if type(actual) ~= \"number\" or actual ~= expected then",
    `    error(${markerPrefix} .. tostring(actual), 0)`,
    "  end",
    "end",
  ].join("\n");
}

export function generateFactorioMod(input: ModSpec): GeneratedFactorioMod {
  const spec = ModSpecSchema.parse(input);

  let dataLua: string;
  let semanticAssertionLua: string;

  if (spec.capability === "prototype_property") {
    for (const change of spec.changes) assertSupportedPrototypeProperty(change);
    dataLua = `${spec.changes.map(renderPrototypePropertyChange).join("\n\n")}\n`;
    semanticAssertionLua = `${spec.assertions.map(renderPrototypePropertyAssertion).join("\n\n")}\n`;
  } else {
    for (const change of spec.changes) assertSupportedRecipeIngredient(change);
    dataLua = `${spec.changes.map(renderRecipeIngredientChange).join("\n\n")}\n`;
    semanticAssertionLua = `${spec.assertions.map(renderRecipeIngredientAssertion).join("\n\n")}\n`;
  }

  const info = {
    name: spec.slug,
    version: GENERATED_VERSION,
    title: spec.title,
    author: GENERATED_AUTHOR,
    factorio_version: spec.target.versionLine,
    dependencies: [`base >= ${spec.target.versionLine}`],
  };
  const manifest = GeneratedFileManifestSchema.parse({
    files: [
      { path: "info.json", content: `${JSON.stringify(info, null, 2)}\n`, role: "metadata" },
      { path: "data.lua", content: dataLua, role: "data_stage" },
    ],
  });

  return {
    name: spec.slug,
    version: GENERATED_VERSION,
    directoryName: `${spec.slug}_${GENERATED_VERSION}`,
    manifest,
    semanticAssertionLua,
  };
}
