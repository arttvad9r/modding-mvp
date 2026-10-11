import {
  GeneratedFileManifestSchema,
  ModSpecSchema,
  ProjectError,
  normalizeProjectError,
  type GeneratedFileManifest,
  type ModAssertion,
  type ModChange,
  type ModSpec,
  type PrototypePropertyAssertion,
  type PrototypePropertyChange,
  type RecipeIngredientAssertion,
  type RecipeIngredientChange,
  type RecipeCraftingTimeAssertion,
  type RecipeCraftingTimeChange,
  type RecipeResultAssertion,
  type RecipeResultChange,
  type ItemStackSizeAssertion,
  type ItemStackSizeChange,
  type ScalarOperation,
  type TechnologyCostAssertion,
  type TechnologyCostChange,
  type TechnologyPrerequisiteAssertion,
  type TechnologyPrerequisiteChange,
} from "@project/domain";

import {
  assertSupportedPrototypeProperty,
  assertSupportedRecipeIngredient,
  assertSupportedRecipeCraftingTime,
  assertSupportedRecipeResult,
  assertSupportedItemStackSize,
  assertSupportedTechnologyCost,
  assertSupportedTechnologyPrerequisite,
  getSupportedPrototypeProperty,
  getSupportedRecipeIngredient,
  getSupportedRecipeCraftingTime,
  getSupportedRecipeResult,
  getSupportedItemStackSize,
  getSupportedTechnologyCost,
  getSupportedTechnologyPrerequisite,
} from "@project/factorio-knowledge";

const GENERATED_VERSION = "0.1.0";
const GENERATED_AUTHOR = "Generated mod";
const SEMANTIC_MARKER = "__PROJECT_SEMANTIC_ASSERTION__";
const MAX_ITEM_INGREDIENT_AMOUNT = 65_535;
const MAX_ITEM_RESULT_AMOUNT = 65_535;
const MAX_ITEM_STACK_SIZE = 65_535;
const MIN_RECIPE_CRAFTING_TIME = 0.001;
const MAX_RECIPE_CRAFTING_TIME = 3_600;
const MAX_SAFE_INTEGER_VALUE = Number.MAX_SAFE_INTEGER;
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

function expectedRecipeCraftingTime(operation: ScalarOperation, baseValue: number): number {
  const expected = applyOperation(operation, baseValue);
  if (expected < MIN_RECIPE_CRAFTING_TIME || expected > MAX_RECIPE_CRAFTING_TIME) {
    throw new Error(`Recipe crafting time must be in range ${MIN_RECIPE_CRAFTING_TIME}..${MAX_RECIPE_CRAFTING_TIME}; got ${expected}`);
  }
  return expected;
}

function expectedRecipeResultAmount(operation: ScalarOperation, baseAmount: number): number {
  const expected = applyOperation(operation, baseAmount);
  if (!Number.isInteger(expected) || expected < 1 || expected > MAX_ITEM_RESULT_AMOUNT) {
    throw new Error(`Item result amount must be an integer in range 1..${MAX_ITEM_RESULT_AMOUNT}; got ${expected}`);
  }
  return expected;
}

function expectedItemStackSize(operation: ScalarOperation, baseValue: number): number {
  const expected = applyOperation(operation, baseValue);
  if (!Number.isInteger(expected) || expected < 1 || expected > MAX_ITEM_STACK_SIZE) {
    throw new Error(`Item stack size must be an integer in range 1..${MAX_ITEM_STACK_SIZE}; got ${expected}`);
  }
  return expected;
}

function expectedTechnologyCount(operation: ScalarOperation, baseCount: number): number {
  const expected = applyOperation(operation, baseCount);
  if (!Number.isSafeInteger(expected) || expected < 1 || expected > MAX_SAFE_INTEGER_VALUE) {
    throw new Error(`Technology count must be a positive safe integer; got ${expected}`);
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

function renderRecipeCraftingTimeChange(change: RecipeCraftingTimeChange): string {
  const supported = getSupportedRecipeCraftingTime(change);
  expectedRecipeCraftingTime(change.operation, supported.baseEnergyRequired);
  const recipeName = quoteLuaIdentifier(change.recipeName, "identifier");
  const missingRecipe = quoteLuaText(`Missing recipe ${change.recipeName}`);
  const nonNumeric = quoteLuaText(`Expected numeric recipe crafting time ${change.recipeName}`);
  return [
    "do",
    `  local recipe = data.raw[\"recipe\"] and data.raw[\"recipe\"][${recipeName}]`,
    `  assert(recipe, ${missingRecipe})`,
    `  local current = recipe.energy_required or ${luaNumber(supported.baseEnergyRequired)}`,
    `  assert(type(current) == \"number\", ${nonNumeric})`,
    `  recipe.energy_required = ${renderOperation(change.operation, "current")}`,
    "end",
  ].join("\n");
}

function renderRecipeResultChange(change: RecipeResultChange): string {
  const supported = getSupportedRecipeResult(change);
  expectedRecipeResultAmount(change.operation, supported.baseAmount);
  const recipeName = quoteLuaIdentifier(change.recipeName, "identifier");
  const resultName = quoteLuaIdentifier(change.resultName, "identifier");
  const missingRecipe = quoteLuaText(`Missing recipe ${change.recipeName}`);
  const missingResult = quoteLuaText(`Missing result ${change.resultType}.${change.resultName} in recipe ${change.recipeName}`);
  const nonNumeric = quoteLuaText(`Expected numeric result amount ${change.recipeName}.${change.resultType}.${change.resultName}`);
  return [
    "do",
    `  local recipe = data.raw[\"recipe\"] and data.raw[\"recipe\"][${recipeName}]`,
    `  assert(recipe, ${missingRecipe})`,
    "  local result = nil",
    "  for _, candidate in ipairs(recipe.results or {}) do",
    `    if candidate.type == \"item\" and candidate.name == ${resultName} then result = candidate break end`,
    "  end",
    `  assert(result, ${missingResult})`,
    `  assert(type(result.amount) == \"number\", ${nonNumeric})`,
    `  result.amount = ${renderOperation(change.operation, "result.amount")}`,
    "end",
  ].join("\n");
}

function renderItemStackSizeChange(change: ItemStackSizeChange): string {
  const supported = getSupportedItemStackSize(change);
  expectedItemStackSize(change.operation, supported.baseStackSize);
  const itemName = quoteLuaIdentifier(change.itemName, "identifier");
  const missingItem = quoteLuaText(`Missing item ${change.itemName}`);
  const nonNumeric = quoteLuaText(`Expected numeric item stack size ${change.itemName}`);
  return [
    "do",
    `  local item = data.raw[\"item\"] and data.raw[\"item\"][${itemName}]`,
    `  assert(item, ${missingItem})`,
    `  assert(type(item.stack_size) == \"number\", ${nonNumeric})`,
    `  item.stack_size = ${renderOperation(change.operation, "item.stack_size")}`,
    "end",
  ].join("\n");
}

function renderTechnologyCostChange(change: TechnologyCostChange): string {
  const supported = getSupportedTechnologyCost(change);
  expectedTechnologyCount(change.operation, supported.baseCount);
  const technologyName = quoteLuaIdentifier(change.technologyName, "identifier");
  const missingTechnology = quoteLuaText(`Missing technology ${change.technologyName}`);
  const missingUnit = quoteLuaText(`Missing technology unit ${change.technologyName}`);
  const nonNumeric = quoteLuaText(`Expected numeric technology count ${change.technologyName}`);

  return [
    "do",
    `  local technology = data.raw[\"technology\"] and data.raw[\"technology\"][${technologyName}]`,
    `  assert(technology, ${missingTechnology})`,
    `  assert(technology.unit, ${missingUnit})`,
    `  assert(type(technology.unit.count) == \"number\", ${nonNumeric})`,
    `  technology.unit.count = ${renderOperation(change.operation, "technology.unit.count")}`,
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

function renderRecipeCraftingTimeAssertion(assertion: RecipeCraftingTimeAssertion): string {
  const supported = getSupportedRecipeCraftingTime({ type: "recipe_crafting_time", recipeName: assertion.recipeName, operation: assertion.expectation });
  const expected = expectedRecipeCraftingTime(assertion.expectation, supported.baseEnergyRequired);
  const recipeName = quoteLuaIdentifier(assertion.recipeName, "identifier");
  const markerPrefix = quoteLuaText(`${SEMANTIC_MARKER}|recipe.${assertion.recipeName}.energy_required|expected=${expected}|actual=`);
  return [
    "do",
    `  local recipe = data.raw[\"recipe\"] and data.raw[\"recipe\"][${recipeName}]`,
    "  local actual = recipe and recipe.energy_required or nil",
    `  local expected = ${luaNumber(expected)}`,
    "  local tolerance = 1e-9 * math.max(1, math.abs(expected))",
    "  if type(actual) ~= \"number\" or math.abs(actual - expected) > tolerance then",
    `    error(${markerPrefix} .. tostring(actual), 0)`,
    "  end",
    "end",
  ].join("\n");
}

function renderRecipeResultAssertion(assertion: RecipeResultAssertion): string {
  const supported = getSupportedRecipeResult({ type: "recipe_result", recipeName: assertion.recipeName, resultType: assertion.resultType, resultName: assertion.resultName, operation: assertion.expectation });
  const expected = expectedRecipeResultAmount(assertion.expectation, supported.baseAmount);
  const recipeName = quoteLuaIdentifier(assertion.recipeName, "identifier");
  const resultName = quoteLuaIdentifier(assertion.resultName, "identifier");
  const markerPrefix = quoteLuaText(`${SEMANTIC_MARKER}|recipe.${assertion.recipeName}.result.${assertion.resultType}.${assertion.resultName}|expected=${expected}|actual=`);
  return [
    "do",
    `  local recipe = data.raw[\"recipe\"] and data.raw[\"recipe\"][${recipeName}]`,
    "  local actual = nil",
    "  if recipe then",
    "    for _, result in ipairs(recipe.results or {}) do",
    `      if result.type == \"item\" and result.name == ${resultName} then actual = result.amount break end`,
    "    end",
    "  end",
    `  local expected = ${luaNumber(expected)}`,
    "  if type(actual) ~= \"number\" or actual ~= expected then",
    `    error(${markerPrefix} .. tostring(actual), 0)`,
    "  end",
    "end",
  ].join("\n");
}

function renderItemStackSizeAssertion(assertion: ItemStackSizeAssertion): string {
  const supported = getSupportedItemStackSize({ type: "item_stack_size", itemName: assertion.itemName, operation: assertion.expectation });
  const expected = expectedItemStackSize(assertion.expectation, supported.baseStackSize);
  const itemName = quoteLuaIdentifier(assertion.itemName, "identifier");
  const markerPrefix = quoteLuaText(`${SEMANTIC_MARKER}|item.${assertion.itemName}.stack_size|expected=${expected}|actual=`);
  return [
    "do",
    `  local item = data.raw[\"item\"] and data.raw[\"item\"][${itemName}]`,
    "  local actual = item and item.stack_size or nil",
    `  local expected = ${luaNumber(expected)}`,
    "  if type(actual) ~= \"number\" or actual ~= expected then",
    `    error(${markerPrefix} .. tostring(actual), 0)`,
    "  end",
    "end",
  ].join("\n");
}

function renderTechnologyPrerequisiteChange(change: TechnologyPrerequisiteChange): string {
  getSupportedTechnologyPrerequisite(change);
  const technologyName = quoteLuaIdentifier(change.technologyName, "identifier");
  const prerequisiteName = quoteLuaIdentifier(change.prerequisiteName, "identifier");
  const missingTechnology = quoteLuaText(`Missing technology ${change.technologyName}`);
  const missingPrerequisiteTechnology = quoteLuaText(`Missing technology ${change.prerequisiteName}`);

  if (change.operation.type === "add") {
    const alreadyPresent = quoteLuaText(
      `Prerequisite ${change.prerequisiteName} already exists on ${change.technologyName}`,
    );
    return [
      "do",
      `  local technology = data.raw[\"technology\"] and data.raw[\"technology\"][${technologyName}]`,
      `  local prerequisite = data.raw[\"technology\"] and data.raw[\"technology\"][${prerequisiteName}]`,
      `  assert(technology, ${missingTechnology})`,
      `  assert(prerequisite, ${missingPrerequisiteTechnology})`,
      "  local prerequisites = technology.prerequisites or {}",
      "  local present = false",
      "  for _, candidate in ipairs(prerequisites) do",
      `    if candidate == ${prerequisiteName} then present = true break end`,
      "  end",
      `  assert(not present, ${alreadyPresent})`,
      `  table.insert(prerequisites, ${prerequisiteName})`,
      "  technology.prerequisites = prerequisites",
      "end",
    ].join("\n");
  }

  const missingPrerequisite = quoteLuaText(
    `Missing prerequisite ${change.prerequisiteName} on ${change.technologyName}`,
  );
  return [
    "do",
    `  local technology = data.raw[\"technology\"] and data.raw[\"technology\"][${technologyName}]`,
    `  assert(technology, ${missingTechnology})`,
    "  local prerequisites = technology.prerequisites or {}",
    "  local index = nil",
    "  for i, candidate in ipairs(prerequisites) do",
    `    if candidate == ${prerequisiteName} then index = i break end`,
    "  end",
    `  assert(index, ${missingPrerequisite})`,
    "  table.remove(prerequisites, index)",
    "  technology.prerequisites = prerequisites",
    "end",
  ].join("\n");
}

function renderTechnologyPrerequisiteAssertion(assertion: TechnologyPrerequisiteAssertion): string {
  getSupportedTechnologyPrerequisite({
    type: "technology_prerequisite",
    technologyName: assertion.technologyName,
    prerequisiteName: assertion.prerequisiteName,
    operation: assertion.expectation,
  });
  const technologyName = quoteLuaIdentifier(assertion.technologyName, "identifier");
  const prerequisiteName = quoteLuaIdentifier(assertion.prerequisiteName, "identifier");
  const expected = assertion.expectation.type === "add";
  const markerPrefix = quoteLuaText(
    `${SEMANTIC_MARKER}|technology.${assertion.technologyName}.prerequisite.${assertion.prerequisiteName}|expected=${expected}|actual=`,
  );

  return [
    "do",
    `  local technology = data.raw[\"technology\"] and data.raw[\"technology\"][${technologyName}]`,
    "  local actual = false",
    "  if technology then",
    "    for _, candidate in ipairs(technology.prerequisites or {}) do",
    `      if candidate == ${prerequisiteName} then actual = true break end`,
    "    end",
    "  end",
    `  local expected = ${expected ? "true" : "false"}`,
    "  if actual ~= expected then",
    `    error(${markerPrefix} .. tostring(actual), 0)`,
    "  end",
    "end",
  ].join("\n");
}

function renderTechnologyCostAssertion(assertion: TechnologyCostAssertion): string {
  const supported = getSupportedTechnologyCost({
    type: "technology_cost",
    technologyName: assertion.technologyName,
    operation: assertion.expectation,
  });
  const expected = expectedTechnologyCount(assertion.expectation, supported.baseCount);
  const technologyName = quoteLuaIdentifier(assertion.technologyName, "identifier");
  const markerPrefix = quoteLuaText(
    `${SEMANTIC_MARKER}|technology.${assertion.technologyName}.unit.count|expected=${expected}|actual=`,
  );

  return [
    "do",
    `  local technology = data.raw[\"technology\"] and data.raw[\"technology\"][${technologyName}]`,
    "  local actual = technology and technology.unit and technology.unit.count or nil",
    `  local expected = ${luaNumber(expected)}`,
    "  if type(actual) ~= \"number\" or actual ~= expected then",
    `    error(${markerPrefix} .. tostring(actual), 0)`,
    "  end",
    "end",
  ].join("\n");
}

function assertSupportedModChange(change: ModChange): void {
  switch (change.type) {
    case "prototype_property":
      assertSupportedPrototypeProperty(change);
      return;
    case "recipe_ingredient":
      assertSupportedRecipeIngredient(change);
      return;
    case "recipe_crafting_time":
      assertSupportedRecipeCraftingTime(change);
      return;
    case "recipe_result":
      assertSupportedRecipeResult(change);
      return;
    case "item_stack_size":
      assertSupportedItemStackSize(change);
      return;
    case "technology_cost":
      assertSupportedTechnologyCost(change);
      return;
    case "technology_prerequisite":
      assertSupportedTechnologyPrerequisite(change);
      return;
  }
}

function renderModChange(change: ModChange): string {
  switch (change.type) {
    case "prototype_property":
      return renderPrototypePropertyChange(change);
    case "recipe_ingredient":
      return renderRecipeIngredientChange(change);
    case "recipe_crafting_time":
      return renderRecipeCraftingTimeChange(change);
    case "recipe_result":
      return renderRecipeResultChange(change);
    case "item_stack_size":
      return renderItemStackSizeChange(change);
    case "technology_cost":
      return renderTechnologyCostChange(change);
    case "technology_prerequisite":
      return renderTechnologyPrerequisiteChange(change);
  }
}

function renderModAssertion(assertion: ModAssertion): string {
  switch (assertion.type) {
    case "prototype_property_matches":
      return renderPrototypePropertyAssertion(assertion);
    case "recipe_ingredient_matches":
      return renderRecipeIngredientAssertion(assertion);
    case "recipe_crafting_time_matches":
      return renderRecipeCraftingTimeAssertion(assertion);
    case "recipe_result_matches":
      return renderRecipeResultAssertion(assertion);
    case "item_stack_size_matches":
      return renderItemStackSizeAssertion(assertion);
    case "technology_cost_matches":
      return renderTechnologyCostAssertion(assertion);
    case "technology_prerequisite_matches":
      return renderTechnologyPrerequisiteAssertion(assertion);
  }
}

function generateFactorioModInternal(input: ModSpec): GeneratedFactorioMod {
  const spec = ModSpecSchema.parse(input);

  for (const change of spec.changes) assertSupportedModChange(change);
  const dataLua = `${spec.changes.map(renderModChange).join("\n\n")}\n`;
  const semanticAssertionLua = `${spec.assertions.map(renderModAssertion).join("\n\n")}\n`;

  const info = {
    name: spec.slug,
    version: GENERATED_VERSION,
    title: spec.title,
    author: GENERATED_AUTHOR,
    factorio_version: spec.target.versionLine,
    dependencies: [`base >= ${spec.target.versionLine}`],
  };
  let manifest: GeneratedFileManifest;
  try {
    manifest = GeneratedFileManifestSchema.parse({
      files: [
        { path: "info.json", content: `${JSON.stringify(info, null, 2)}\n`, role: "metadata" },
        { path: "data.lua", content: dataLua, role: "data_stage" },
      ],
    });
  } catch (error) {
    throw new ProjectError({
      code: "generation_error",
      stage: "generation",
      message: "Generator produced an invalid file manifest",
      cause: error,
    });
  }

  return {
    name: spec.slug,
    version: GENERATED_VERSION,
    directoryName: `${spec.slug}_${GENERATED_VERSION}`,
    manifest,
    semanticAssertionLua,
  };
}

export function generateFactorioMod(input: ModSpec): GeneratedFactorioMod {
  try {
    return generateFactorioModInternal(input);
  } catch (error) {
    throw normalizeProjectError(error, {
      code: "generation_error",
      stage: "generation",
      message: "Factorio generation failed",
    });
  }
}
