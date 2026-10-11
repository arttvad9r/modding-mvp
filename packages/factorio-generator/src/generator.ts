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
  type NewMachineAssertion,
  type NewMachineChange,
  type NewMachineScienceTier,
  type NewRecipeAssertion,
  type NewRecipeChange,
  type NewItemAssertion,
  type NewItemChange,
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
  assertSupportedNewMachine,
  getSupportedNewMachineTemplate,
  assertSupportedNewRecipe,
  assertSupportedNewItem,
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

const SCIENCE_TIER_PACKS: Record<NewMachineScienceTier, readonly string[]> = {
  automation: ["automation-science-pack"],
  logistic: ["automation-science-pack", "logistic-science-pack"],
  chemical: ["automation-science-pack", "logistic-science-pack", "chemical-science-pack"],
  production: ["automation-science-pack", "logistic-science-pack", "chemical-science-pack", "production-science-pack"],
  utility: ["automation-science-pack", "logistic-science-pack", "chemical-science-pack", "utility-science-pack"],
};

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

function renderNewItemChange(change: NewItemChange): string {
  assertSupportedNewItem(change);
  const baseItemName = quoteLuaIdentifier(change.baseItemName, "identifier");
  const name = quoteLuaIdentifier(change.name, "identifier");
  const displayName = quoteLuaText(change.displayName);
  const ingredients = change.recipeIngredients
    .map((ingredient) => `{type="item", name=${quoteLuaIdentifier(ingredient.itemName, "identifier")}, amount=${ingredient.amount}}`)
    .join(", ");
  const technologyName = change.unlock.type === "existing_technology" ? change.unlock.technologyName : `${change.name}-technology`;
  const technologyNameLua = quoteLuaIdentifier(technologyName, "identifier");
  const technologyLines: string[] = [];
  if (change.unlock.type === "new_technology") {
    const prerequisites = change.unlock.prerequisites.map((value) => quoteLuaIdentifier(value, "identifier")).join(", ");
    const scienceIngredients = SCIENCE_TIER_PACKS[change.unlock.scienceTier]
      .map((pack) => `{${quoteLuaIdentifier(pack, "identifier")}, 1}`)
      .join(", ");
    technologyLines.push(
      '  local technology_template = data.raw["technology"] and data.raw["technology"]["automation-2"]',
      `  assert(technology_template, ${quoteLuaText("Missing technology template automation-2")})`,
      "  local technology = table.deepcopy(technology_template)",
      `  technology.name = ${technologyNameLua}`,
      `  technology.localised_name = {"", ${quoteLuaText(change.unlock.displayName)}}`,
      `  technology.prerequisites = {${prerequisites}}`,
      `  technology.effects = {{type="unlock-recipe", recipe=${name}}}`,
      `  technology.unit = {count=${change.unlock.count}, ingredients={${scienceIngredients}}, time=${luaNumber(change.unlock.time)}}`,
      `  technology.order = (technology.order or "z") .. "-z[" .. ${technologyNameLua} .. "]"`,
      "  data:extend({technology})",
    );
  } else {
    technologyLines.push(
      `  local technology = data.raw["technology"] and data.raw["technology"][${technologyNameLua}]`,
      `  assert(technology, ${quoteLuaText(`Missing unlock technology ${technologyName}`)})`,
      "  technology.effects = technology.effects or {}",
      "  local already_unlocks = false",
      "  for _, effect in ipairs(technology.effects) do",
      `    if effect.type == "unlock-recipe" and effect.recipe == ${name} then already_unlocks = true break end`,
      "  end",
      `  assert(not already_unlocks, ${quoteLuaText(`Technology ${technologyName} already unlocks recipe ${change.name}`)})`,
      `  table.insert(technology.effects, {type="unlock-recipe", recipe=${name}})`,
    );
  }
  return [
    "do",
    `  local item_template = data.raw["item"] and data.raw["item"][${baseItemName}]`,
    `  assert(item_template, ${quoteLuaText(`Missing item template ${change.baseItemName}`)})`,
    "  local item = table.deepcopy(item_template)",
    `  item.name = ${name}`,
    `  item.localised_name = {"", ${displayName}}`,
    `  item.stack_size = ${change.stackSize}`,
    "  item.place_result = nil",
    `  item.order = (item.order or "z") .. "-z[" .. ${name} .. "]"`,
    "  local recipe = {",
    '    type = "recipe",',
    `    name = ${name},`,
    `    localised_name = {"", ${displayName}},`,
    "    enabled = false,",
    `    energy_required = ${luaNumber(change.recipeCraftingTime)},`,
    `    ingredients = {${ingredients}},`,
    `    results = {{type="item", name=${name}, amount=${change.recipeResultAmount}}},`,
    `    main_product = ${name}`,
    "  }",
    "  data:extend({item, recipe})",
    ...technologyLines,
    "end",
  ].join("\n");
}

function renderNewItemAssertion(assertion: NewItemAssertion): string {
  assertSupportedNewItem({ ...assertion, type: "new_item" });
  const name = quoteLuaIdentifier(assertion.name, "identifier");
  const technologyName = assertion.unlock.type === "existing_technology" ? assertion.unlock.technologyName : `${assertion.name}-technology`;
  const marker = (field: string, expected: string) => quoteLuaText(`${SEMANTIC_MARKER}|new-item.${assertion.name}.${field}|expected=${expected}|actual=`);
  const lines = [
    "do",
    `  local item = data.raw["item"] and data.raw["item"][${name}]`,
    `  local recipe = data.raw["recipe"] and data.raw["recipe"][${name}]`,
    `  if not item then error(${marker("item", "present")} .. "nil", 0) end`,
    `  if not recipe then error(${marker("recipe", "present")} .. "nil", 0) end`,
    `  if item.stack_size ~= ${assertion.stackSize} then error(${marker("stack_size", String(assertion.stackSize))} .. tostring(item.stack_size), 0) end`,
    `  if item.place_result ~= nil then error(${marker("place_result", "nil")} .. tostring(item.place_result), 0) end`,
    `  if recipe.energy_required ~= ${luaNumber(assertion.recipeCraftingTime)} then error(${marker("recipe_time", String(assertion.recipeCraftingTime))} .. tostring(recipe.energy_required), 0) end`,
    `  local ingredient_count = recipe.ingredients and #recipe.ingredients or 0`,
    `  if ingredient_count ~= ${assertion.recipeIngredients.length} then error(${marker("ingredient_count", String(assertion.recipeIngredients.length))} .. tostring(ingredient_count), 0) end`,
  ];
  for (const ingredient of assertion.recipeIngredients) {
    const ingredientName = quoteLuaIdentifier(ingredient.itemName, "identifier");
    lines.push(
      "  do",
      "    local actual = nil",
      "    for _, candidate in ipairs(recipe.ingredients or {}) do",
      `      if candidate.name == ${ingredientName} and (candidate.type == nil or candidate.type == "item") then actual = candidate.amount break end`,
      "    end",
      `    if actual ~= ${ingredient.amount} then error(${marker(`ingredient.${ingredient.itemName}`, String(ingredient.amount))} .. tostring(actual), 0) end`,
      "  end",
    );
  }
  lines.push(
    "  local actual_result = nil",
    "  for _, result in ipairs(recipe.results or {}) do",
    `    if result.name == ${name} and (result.type == nil or result.type == "item") then actual_result = result.amount break end`,
    "  end",
    `  if actual_result ~= ${assertion.recipeResultAmount} then error(${marker("result_amount", String(assertion.recipeResultAmount))} .. tostring(actual_result), 0) end`,
    `  local technology = data.raw["technology"] and data.raw["technology"][${quoteLuaIdentifier(technologyName, "identifier")}]`,
    `  if not technology then error(${marker("unlock_technology", technologyName)} .. "nil", 0) end`,
    "  local unlock_present = false",
    "  for _, effect in ipairs(technology.effects or {}) do",
    `    if effect.type == "unlock-recipe" and effect.recipe == ${name} then unlock_present = true break end`,
    "  end",
    `  if not unlock_present then error(${marker("unlock_recipe", assertion.name)} .. "false", 0) end`,
  );
  if (assertion.unlock.type === "new_technology") {
    lines.push(
      `  if not technology.unit or technology.unit.count ~= ${assertion.unlock.count} then error(${marker("technology_count", String(assertion.unlock.count))} .. tostring(technology.unit and technology.unit.count), 0) end`,
      `  if technology.unit.time ~= ${luaNumber(assertion.unlock.time)} then error(${marker("technology_time", String(assertion.unlock.time))} .. tostring(technology.unit and technology.unit.time), 0) end`,
      `  local expected_science = ${SCIENCE_TIER_PACKS[assertion.unlock.scienceTier].length}`,
      "  local actual_science = technology.unit.ingredients and #technology.unit.ingredients or 0",
      `  if actual_science ~= expected_science then error(${marker("science_pack_count", String(SCIENCE_TIER_PACKS[assertion.unlock.scienceTier].length))} .. tostring(actual_science), 0) end`,
    );
    for (const pack of SCIENCE_TIER_PACKS[assertion.unlock.scienceTier]) {
      const packName = quoteLuaIdentifier(pack, "identifier");
      lines.push(
        "  do", "    local actual = nil", "    for _, ingredient in ipairs(technology.unit.ingredients or {}) do",
        "      local ingredient_name = ingredient.name or ingredient[1]", "      local ingredient_amount = ingredient.amount or ingredient[2]",
        `      if ingredient_name == ${packName} then actual = ingredient_amount break end`, "    end",
        `    if actual ~= 1 then error(${marker(`science.${pack}`, "1")} .. tostring(actual), 0) end`, "  end",
      );
    }
    lines.push(`  local prerequisite_count = technology.prerequisites and #technology.prerequisites or 0`);
    lines.push(`  if prerequisite_count ~= ${assertion.unlock.prerequisites.length} then error(${marker("prerequisite_count", String(assertion.unlock.prerequisites.length))} .. tostring(prerequisite_count), 0) end`);
    for (const prerequisite of assertion.unlock.prerequisites) {
      const prerequisiteName = quoteLuaIdentifier(prerequisite, "identifier");
      lines.push(
        "  do", "    local present = false", "    for _, candidate in ipairs(technology.prerequisites or {}) do",
        `      if candidate == ${prerequisiteName} then present = true break end`, "    end",
        `    if not present then error(${marker(`prerequisite.${prerequisite}`, "present")} .. "false", 0) end`, "  end",
      );
    }
  }
  lines.push("end");
  return lines.join("\n");
}

function renderNewRecipeChange(change: NewRecipeChange, additionalItems: ReadonlySet<string> = new Set()): string {
  assertSupportedNewRecipe(change, additionalItems);
  const name = quoteLuaIdentifier(change.name, "identifier");
  const displayName = quoteLuaText(change.displayName);
  const resultName = quoteLuaIdentifier(change.resultItemName, "identifier");
  const ingredients = change.ingredients
    .map((ingredient) => `{type="item", name=${quoteLuaIdentifier(ingredient.itemName, "identifier")}, amount=${ingredient.amount}}`)
    .join(", ");
  const technologyName = change.unlock.type === "existing_technology" ? change.unlock.technologyName : `${change.name}-technology`;
  const technologyNameLua = quoteLuaIdentifier(technologyName, "identifier");
  const technologyLines: string[] = [];
  if (change.unlock.type === "new_technology") {
    const prerequisites = change.unlock.prerequisites.map((value) => quoteLuaIdentifier(value, "identifier")).join(", ");
    const scienceIngredients = SCIENCE_TIER_PACKS[change.unlock.scienceTier]
      .map((pack) => `{${quoteLuaIdentifier(pack, "identifier")}, 1}`)
      .join(", ");
    technologyLines.push(
      '  local technology_template = data.raw["technology"] and data.raw["technology"]["automation-2"]',
      `  assert(technology_template, ${quoteLuaText("Missing technology template automation-2")})`,
      "  local technology = table.deepcopy(technology_template)",
      `  technology.name = ${technologyNameLua}`,
      `  technology.localised_name = {"", ${quoteLuaText(change.unlock.displayName)}}`,
      `  technology.prerequisites = {${prerequisites}}`,
      `  technology.effects = {{type="unlock-recipe", recipe=${name}}}`,
      `  technology.unit = {count=${change.unlock.count}, ingredients={${scienceIngredients}}, time=${luaNumber(change.unlock.time)}}`,
      `  technology.order = (technology.order or "z") .. "-z[" .. ${technologyNameLua} .. "]"`,
      "  data:extend({technology})",
    );
  } else {
    technologyLines.push(
      `  local technology = data.raw["technology"] and data.raw["technology"][${technologyNameLua}]`,
      `  assert(technology, ${quoteLuaText(`Missing unlock technology ${technologyName}`)})`,
      "  technology.effects = technology.effects or {}",
      "  local already_unlocks = false",
      "  for _, effect in ipairs(technology.effects) do",
      `    if effect.type == "unlock-recipe" and effect.recipe == ${name} then already_unlocks = true break end`,
      "  end",
      `  assert(not already_unlocks, ${quoteLuaText(`Technology ${technologyName} already unlocks recipe ${change.name}`)})`,
      `  table.insert(technology.effects, {type="unlock-recipe", recipe=${name}})`,
    );
  }
  return [
    "do",
    "  local recipe = {",
    '    type = "recipe",',
    `    name = ${name},`,
    `    localised_name = {"", ${displayName}},`,
    "    enabled = false,",
    `    energy_required = ${luaNumber(change.energyRequired)},`,
    `    ingredients = {${ingredients}},`,
    `    results = {{type="item", name=${resultName}, amount=${change.resultAmount}}},`,
    `    main_product = ${resultName}`,
    "  }",
    "  data:extend({recipe})",
    ...technologyLines,
    "end",
  ].join("\n");
}

function renderNewRecipeAssertion(assertion: NewRecipeAssertion, additionalItems: ReadonlySet<string> = new Set()): string {
  assertSupportedNewRecipe({ ...assertion, type: "new_recipe" }, additionalItems);
  const name = quoteLuaIdentifier(assertion.name, "identifier");
  const resultName = quoteLuaIdentifier(assertion.resultItemName, "identifier");
  const technologyName = assertion.unlock.type === "existing_technology" ? assertion.unlock.technologyName : `${assertion.name}-technology`;
  const marker = (field: string, expected: string) => quoteLuaText(`${SEMANTIC_MARKER}|new-recipe.${assertion.name}.${field}|expected=${expected}|actual=`);
  const lines = [
    "do",
    `  local recipe = data.raw["recipe"] and data.raw["recipe"][${name}]`,
    `  if not recipe then error(${marker("recipe", "present")} .. "nil", 0) end`,
    `  if recipe.energy_required ~= ${luaNumber(assertion.energyRequired)} then error(${marker("energy_required", String(assertion.energyRequired))} .. tostring(recipe.energy_required), 0) end`,
    `  if recipe.main_product ~= ${resultName} then error(${marker("main_product", assertion.resultItemName)} .. tostring(recipe.main_product), 0) end`,
    `  local ingredient_count = recipe.ingredients and #recipe.ingredients or 0`,
    `  if ingredient_count ~= ${assertion.ingredients.length} then error(${marker("ingredient_count", String(assertion.ingredients.length))} .. tostring(ingredient_count), 0) end`,
  ];
  for (const ingredient of assertion.ingredients) {
    const ingredientName = quoteLuaIdentifier(ingredient.itemName, "identifier");
    lines.push(
      "  do",
      "    local actual = nil",
      "    for _, candidate in ipairs(recipe.ingredients or {}) do",
      `      if candidate.name == ${ingredientName} and (candidate.type == nil or candidate.type == "item") then actual = candidate.amount break end`,
      "    end",
      `    if actual ~= ${ingredient.amount} then error(${marker(`ingredient.${ingredient.itemName}`, String(ingredient.amount))} .. tostring(actual), 0) end`,
      "  end",
    );
  }
  lines.push(
    "  local result_count = recipe.results and #recipe.results or 0",
    `  if result_count ~= 1 then error(${marker("result_count", "1")} .. tostring(result_count), 0) end`,
    "  local actual_result = nil",
    "  for _, result in ipairs(recipe.results or {}) do",
    `    if result.name == ${resultName} and (result.type == nil or result.type == "item") then actual_result = result.amount break end`,
    "  end",
    `  if actual_result ~= ${assertion.resultAmount} then error(${marker(`result.${assertion.resultItemName}`, String(assertion.resultAmount))} .. tostring(actual_result), 0) end`,
    `  local technology = data.raw["technology"] and data.raw["technology"][${quoteLuaIdentifier(technologyName, "identifier")}]`,
    `  if not technology then error(${marker("unlock_technology", technologyName)} .. "nil", 0) end`,
    "  local unlock_present = false",
    "  for _, effect in ipairs(technology.effects or {}) do",
    `    if effect.type == "unlock-recipe" and effect.recipe == ${name} then unlock_present = true break end`,
    "  end",
    `  if not unlock_present then error(${marker("unlock_recipe", assertion.name)} .. "false", 0) end`,
  );
  if (assertion.unlock.type === "new_technology") {
    lines.push(
      `  if not technology.unit or technology.unit.count ~= ${assertion.unlock.count} then error(${marker("technology_count", String(assertion.unlock.count))} .. tostring(technology.unit and technology.unit.count), 0) end`,
      `  if technology.unit.time ~= ${luaNumber(assertion.unlock.time)} then error(${marker("technology_time", String(assertion.unlock.time))} .. tostring(technology.unit and technology.unit.time), 0) end`,
      `  local expected_science = ${SCIENCE_TIER_PACKS[assertion.unlock.scienceTier].length}`,
      "  local actual_science = technology.unit.ingredients and #technology.unit.ingredients or 0",
      `  if actual_science ~= expected_science then error(${marker("science_pack_count", String(SCIENCE_TIER_PACKS[assertion.unlock.scienceTier].length))} .. tostring(actual_science), 0) end`,
    );
    for (const pack of SCIENCE_TIER_PACKS[assertion.unlock.scienceTier]) {
      const packName = quoteLuaIdentifier(pack, "identifier");
      lines.push(
        "  do",
        "    local actual = nil",
        "    for _, ingredient in ipairs(technology.unit.ingredients or {}) do",
        "      local ingredient_name = ingredient.name or ingredient[1]",
        "      local ingredient_amount = ingredient.amount or ingredient[2]",
        `      if ingredient_name == ${packName} then actual = ingredient_amount break end`,
        "    end",
        `    if actual ~= 1 then error(${marker(`science.${pack}`, "1")} .. tostring(actual), 0) end`,
        "  end",
      );
    }
    lines.push(`  local prerequisite_count = technology.prerequisites and #technology.prerequisites or 0`);
    lines.push(`  if prerequisite_count ~= ${assertion.unlock.prerequisites.length} then error(${marker("prerequisite_count", String(assertion.unlock.prerequisites.length))} .. tostring(prerequisite_count), 0) end`);
    for (const prerequisite of assertion.unlock.prerequisites) {
      const prerequisiteName = quoteLuaIdentifier(prerequisite, "identifier");
      lines.push(
        "  do", "    local present = false", "    for _, candidate in ipairs(technology.prerequisites or {}) do",
        `      if candidate == ${prerequisiteName} then present = true break end`, "    end",
        `    if not present then error(${marker(`prerequisite.${prerequisite}`, "present")} .. "false", 0) end`, "  end",
      );
    }
  }
  lines.push("end");
  return lines.join("\n");
}

function renderNewMachineChange(change: NewMachineChange, additionalItems: ReadonlySet<string> = new Set()): string {
  const template = getSupportedNewMachineTemplate(change, additionalItems);
  const machineType = quoteLuaIdentifier(change.machineType, "identifier");
  const basePrototypeName = quoteLuaIdentifier(change.basePrototypeName, "identifier");
  const baseItemName = quoteLuaIdentifier(template.baseItemName, "identifier");
  const name = quoteLuaIdentifier(change.name, "identifier");
  const displayName = quoteLuaText(change.displayName);
  const recipeIngredients = change.recipeIngredients
    .map((ingredient) => `{type="item", name=${quoteLuaIdentifier(ingredient.itemName, "identifier")}, amount=${ingredient.amount}}`)
    .join(", ");
  const energyUsage = quoteLuaText(`${luaNumber(change.energyUsageKw)}kW`);
  const technologyName = change.unlock.type === "existing_technology"
    ? change.unlock.technologyName
    : `${change.name}-technology`;
  const technologyNameLua = quoteLuaIdentifier(technologyName, "identifier");
  const technologyLines: string[] = [];

  if (change.unlock.type === "new_technology") {
    const templateTechnology = change.machineType === "furnace" ? "advanced-material-processing-2" : "automation-2";
    const prerequisites = change.unlock.prerequisites.map((value) => quoteLuaIdentifier(value, "identifier")).join(", ");
    const scienceIngredients = SCIENCE_TIER_PACKS[change.unlock.scienceTier]
      .map((pack) => `{${quoteLuaIdentifier(pack, "identifier")}, 1}`)
      .join(", ");
    technologyLines.push(
      `  local technology_template = data.raw["technology"] and data.raw["technology"][${quoteLuaIdentifier(templateTechnology, "identifier")}]`,
      `  assert(technology_template, ${quoteLuaText(`Missing technology template ${templateTechnology}`)})`,
      "  local technology = table.deepcopy(technology_template)",
      `  technology.name = ${technologyNameLua}`,
      `  technology.localised_name = {"", ${quoteLuaText(change.unlock.displayName)}}`,
      `  technology.prerequisites = {${prerequisites}}`,
      `  technology.effects = {{type="unlock-recipe", recipe=${name}}}`,
      `  technology.unit = {count=${change.unlock.count}, ingredients={${scienceIngredients}}, time=${luaNumber(change.unlock.time)}}`,
      `  technology.order = (technology.order or "z") .. "-z[" .. ${technologyNameLua} .. "]"`,
      "  data:extend({technology})",
    );
  } else {
    technologyLines.push(
      `  local technology = data.raw["technology"] and data.raw["technology"][${technologyNameLua}]`,
      `  assert(technology, ${quoteLuaText(`Missing unlock technology ${technologyName}`)})`,
      "  technology.effects = technology.effects or {}",
      "  local already_unlocks = false",
      "  for _, effect in ipairs(technology.effects) do",
      `    if effect.type == "unlock-recipe" and effect.recipe == ${name} then already_unlocks = true break end`,
      "  end",
      `  assert(not already_unlocks, ${quoteLuaText(`Technology ${technologyName} already unlocks recipe ${change.name}`)})`,
      `  table.insert(technology.effects, {type="unlock-recipe", recipe=${name}})`,
    );
  }

  return [
    "do",
    `  local entity_template = data.raw[${machineType}] and data.raw[${machineType}][${basePrototypeName}]`,
    `  local item_template = data.raw["item"] and data.raw["item"][${baseItemName}]`,
    `  assert(entity_template, ${quoteLuaText(`Missing machine template ${change.machineType}.${change.basePrototypeName}`)})`,
    `  assert(item_template, ${quoteLuaText(`Missing machine item template ${template.baseItemName}`)})`,
    "  local entity = table.deepcopy(entity_template)",
    `  entity.name = ${name}`,
    `  entity.localised_name = {"", ${displayName}}`,
    `  entity[${quoteLuaText(template.speedProperty)}] = ${luaNumber(change.speed)}`,
    `  entity.energy_usage = ${energyUsage}`,
    `  entity.module_slots = ${change.moduleSlots}`,
    "  entity.next_upgrade = nil",
    "  entity.minable = entity.minable or {mining_time=0.1}",
    `  entity.minable.result = ${name}`,
    "  local item = table.deepcopy(item_template)",
    `  item.name = ${name}`,
    `  item.localised_name = {"", ${displayName}}`,
    `  item.place_result = ${name}`,
    `  item.stack_size = ${change.itemStackSize}`,
    `  item.order = (item.order or "z") .. "-z[" .. ${name} .. "]"`,
    "  local recipe = {",
    '    type = "recipe",',
    `    name = ${name},`,
    `    localised_name = {"", ${displayName}},`,
    "    enabled = false,",
    `    energy_required = ${luaNumber(change.recipeCraftingTime)},`,
    `    ingredients = {${recipeIngredients}},`,
    `    results = {{type="item", name=${name}, amount=1}},`,
    `    main_product = ${name}`,
    "  }",
    "  data:extend({entity, item, recipe})",
    ...technologyLines,
    "end",
  ].join("\n");
}

function renderNewMachineAssertion(assertion: NewMachineAssertion, additionalItems: ReadonlySet<string> = new Set()): string {
  const template = getSupportedNewMachineTemplate({ ...assertion, type: "new_machine" }, additionalItems);
  const machineType = quoteLuaIdentifier(assertion.machineType, "identifier");
  const name = quoteLuaIdentifier(assertion.name, "identifier");
  const technologyName = assertion.unlock.type === "existing_technology"
    ? assertion.unlock.technologyName
    : `${assertion.name}-technology`;
  const expectedEnergy = `${luaNumber(assertion.energyUsageKw)}kW`;
  const marker = (field: string, expected: string) => quoteLuaText(`${SEMANTIC_MARKER}|new-machine.${assertion.name}.${field}|expected=${expected}|actual=`);
  const lines = [
    "do",
    `  local entity = data.raw[${machineType}] and data.raw[${machineType}][${name}]`,
    `  local item = data.raw["item"] and data.raw["item"][${name}]`,
    `  local recipe = data.raw["recipe"] and data.raw["recipe"][${name}]`,
    `  if not entity then error(${marker("entity", "present")} .. "nil", 0) end`,
    `  if not item then error(${marker("item", "present")} .. "nil", 0) end`,
    `  if not recipe then error(${marker("recipe", "present")} .. "nil", 0) end`,
    `  local actual_speed = entity[${quoteLuaText(template.speedProperty)}]`,
    `  if actual_speed ~= ${luaNumber(assertion.speed)} then error(${marker("speed", String(assertion.speed))} .. tostring(actual_speed), 0) end`,
    `  if entity.energy_usage ~= ${quoteLuaText(expectedEnergy)} then error(${marker("energy_usage", expectedEnergy)} .. tostring(entity.energy_usage), 0) end`,
    `  if entity.module_slots ~= ${assertion.moduleSlots} then error(${marker("module_slots", String(assertion.moduleSlots))} .. tostring(entity.module_slots), 0) end`,
    `  if not entity.minable or entity.minable.result ~= ${name} then error(${marker("minable_result", assertion.name)} .. tostring(entity.minable and entity.minable.result), 0) end`,
    `  if item.place_result ~= ${name} then error(${marker("place_result", assertion.name)} .. tostring(item.place_result), 0) end`,
    `  if item.stack_size ~= ${assertion.itemStackSize} then error(${marker("stack_size", String(assertion.itemStackSize))} .. tostring(item.stack_size), 0) end`,
    `  if recipe.energy_required ~= ${luaNumber(assertion.recipeCraftingTime)} then error(${marker("recipe_time", String(assertion.recipeCraftingTime))} .. tostring(recipe.energy_required), 0) end`,
    `  local expected_ingredients = ${assertion.recipeIngredients.length}`,
    "  local actual_ingredients = recipe.ingredients and #recipe.ingredients or 0",
    `  if actual_ingredients ~= expected_ingredients then error(${marker("ingredient_count", String(assertion.recipeIngredients.length))} .. tostring(actual_ingredients), 0) end`,
  ];
  for (const ingredient of assertion.recipeIngredients) {
    const ingredientName = quoteLuaIdentifier(ingredient.itemName, "identifier");
    lines.push(
      "  do",
      "    local actual = nil",
      "    for _, candidate in ipairs(recipe.ingredients or {}) do",
      `      if candidate.name == ${ingredientName} and (candidate.type == nil or candidate.type == "item") then actual = candidate.amount break end`,
      "    end",
      `    if actual ~= ${ingredient.amount} then error(${marker(`ingredient.${ingredient.itemName}`, String(ingredient.amount))} .. tostring(actual), 0) end`,
      "  end",
    );
  }
  lines.push(
    `  local technology = data.raw["technology"] and data.raw["technology"][${quoteLuaIdentifier(technologyName, "identifier")}]`,
    `  if not technology then error(${marker("unlock_technology", technologyName)} .. "nil", 0) end`,
    "  local unlock_present = false",
    "  for _, effect in ipairs(technology.effects or {}) do",
    `    if effect.type == "unlock-recipe" and effect.recipe == ${name} then unlock_present = true break end`,
    "  end",
    `  if not unlock_present then error(${marker("unlock_recipe", assertion.name)} .. "false", 0) end`,
  );
  if (assertion.unlock.type === "new_technology") {
    lines.push(
      `  if not technology.unit or technology.unit.count ~= ${assertion.unlock.count} then error(${marker("technology_count", String(assertion.unlock.count))} .. tostring(technology.unit and technology.unit.count), 0) end`,
      `  if technology.unit.time ~= ${luaNumber(assertion.unlock.time)} then error(${marker("technology_time", String(assertion.unlock.time))} .. tostring(technology.unit and technology.unit.time), 0) end`,
      `  local expected_science = ${SCIENCE_TIER_PACKS[assertion.unlock.scienceTier].length}`,
      "  local actual_science = technology.unit.ingredients and #technology.unit.ingredients or 0",
      `  if actual_science ~= expected_science then error(${marker("science_pack_count", String(SCIENCE_TIER_PACKS[assertion.unlock.scienceTier].length))} .. tostring(actual_science), 0) end`,
    );
    for (const pack of SCIENCE_TIER_PACKS[assertion.unlock.scienceTier]) {
      const packName = quoteLuaIdentifier(pack, "identifier");
      lines.push(
        "  do",
        "    local actual = nil",
        "    for _, ingredient in ipairs(technology.unit.ingredients or {}) do",
        `      local ingredient_name = ingredient.name or ingredient[1]`,
        "      local ingredient_amount = ingredient.amount or ingredient[2]",
        `      if ingredient_name == ${packName} then actual = ingredient_amount break end`,
        "    end",
        `    if actual ~= 1 then error(${marker(`science.${pack}`, "1")} .. tostring(actual), 0) end`,
        "  end",
      );
    }
    lines.push(`  local prerequisite_count = technology.prerequisites and #technology.prerequisites or 0`);
    lines.push(`  if prerequisite_count ~= ${assertion.unlock.prerequisites.length} then error(${marker("prerequisite_count", String(assertion.unlock.prerequisites.length))} .. tostring(prerequisite_count), 0) end`);
    for (const prerequisite of assertion.unlock.prerequisites) {
      const prerequisiteName = quoteLuaIdentifier(prerequisite, "identifier");
      lines.push(
        "  do",
        "    local present = false",
        "    for _, candidate in ipairs(technology.prerequisites or {}) do",
        `      if candidate == ${prerequisiteName} then present = true break end`,
        "    end",
        `    if not present then error(${marker(`prerequisite.${prerequisite}`, "present")} .. "false", 0) end`,
        "  end",
      );
    }
  }
  lines.push("end");
  return lines.join("\n");
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

function assertSupportedModChange(change: ModChange, additionalItems: ReadonlySet<string> = new Set()): void {
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
    case "new_machine":
      assertSupportedNewMachine(change, additionalItems);
      return;
    case "new_recipe":
      assertSupportedNewRecipe(change, additionalItems);
      return;
    case "new_item":
      assertSupportedNewItem(change);
      return;
  }
}

function renderModChange(change: ModChange, additionalItems: ReadonlySet<string> = new Set()): string {
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
    case "new_machine":
      return renderNewMachineChange(change, additionalItems);
    case "new_recipe":
      return renderNewRecipeChange(change, additionalItems);
    case "new_item":
      return renderNewItemChange(change);
  }
}

function renderModAssertion(assertion: ModAssertion, additionalItems: ReadonlySet<string> = new Set()): string {
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
    case "new_machine_matches":
      return renderNewMachineAssertion(assertion, additionalItems);
    case "new_recipe_matches":
      return renderNewRecipeAssertion(assertion, additionalItems);
    case "new_item_matches":
      return renderNewItemAssertion(assertion);
  }
}

function generateFactorioModInternal(input: ModSpec): GeneratedFactorioMod {
  const spec = ModSpecSchema.parse(input);

  const contentNames = new Map<string, string>();
  const customItemNames = new Set<string>();
  for (const change of spec.changes) {
    if (change.type === "new_item" || change.type === "new_machine" || change.type === "new_recipe") {
      const previous = contentNames.get(change.name);
      if (previous !== undefined) {
        throw new ProjectError({ code: "unsupported_capability", stage: "generation", message: `Content name collision: ${change.name} is used by both ${previous} and ${change.type}` });
      }
      contentNames.set(change.name, change.type);
    }
    if (change.type === "new_item") customItemNames.add(change.name);
  }
  for (const change of spec.changes) assertSupportedModChange(change, customItemNames);
  const orderedChanges = [...spec.changes].sort((left, right) => Number(right.type === "new_item") - Number(left.type === "new_item"));
  const dataLua = `${orderedChanges.map((change) => renderModChange(change, customItemNames)).join("\n\n")}\n`;
  const semanticAssertionLua = `${spec.assertions.map((assertion) => renderModAssertion(assertion, customItemNames)).join("\n\n")}\n`;

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
