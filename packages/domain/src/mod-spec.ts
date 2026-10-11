import { z } from "zod";

const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const factorioIdentifier = /^[a-z0-9][a-z0-9_-]*$/;
const propertyIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

const finiteNumber = z.number().refine(Number.isFinite, "Value must be finite");

export const GameTargetSchema = z.strictObject({
  game: z.literal("factorio"),
  channel: z.literal("stable"),
  versionLine: z.literal("2.0"),
});

export const SetOperationSchema = z.strictObject({
  type: z.literal("set"),
  value: finiteNumber,
});

export const MultiplyOperationSchema = z.strictObject({
  type: z.literal("multiply"),
  factor: finiteNumber,
});

export const ScalarOperationSchema = z.discriminatedUnion("type", [
  SetOperationSchema,
  MultiplyOperationSchema,
]);

const baseSpecFields = {
  title: z.string().trim().min(1).max(120),
  slug: z.string().min(1).max(80).regex(safeSlug),
  target: GameTargetSchema,
} as const;

const prototypeAddressFields = {
  prototypeType: z.string().min(1).max(80).regex(factorioIdentifier),
  prototypeName: z.string().min(1).max(160).regex(factorioIdentifier),
  property: z.string().min(1).max(120).regex(propertyIdentifier),
} as const;

export const PrototypePropertyChangeSchema = z.strictObject({
  type: z.literal("prototype_property"),
  ...prototypeAddressFields,
  operation: ScalarOperationSchema,
});

export const PrototypePropertyAssertionSchema = z.strictObject({
  type: z.literal("prototype_property_matches"),
  ...prototypeAddressFields,
  expectation: ScalarOperationSchema,
});

const recipeIngredientAddressFields = {
  recipeName: z.string().min(1).max(160).regex(factorioIdentifier),
  ingredientType: z.literal("item"),
  ingredientName: z.string().min(1).max(160).regex(factorioIdentifier),
} as const;

export const RecipeIngredientChangeSchema = z.strictObject({
  type: z.literal("recipe_ingredient"),
  ...recipeIngredientAddressFields,
  operation: ScalarOperationSchema,
});

export const RecipeIngredientAssertionSchema = z.strictObject({
  type: z.literal("recipe_ingredient_matches"),
  ...recipeIngredientAddressFields,
  expectation: ScalarOperationSchema,
});

const recipeAddressFields = {
  recipeName: z.string().min(1).max(160).regex(factorioIdentifier),
} as const;

export const RecipeCraftingTimeChangeSchema = z.strictObject({
  type: z.literal("recipe_crafting_time"),
  ...recipeAddressFields,
  operation: ScalarOperationSchema,
});

export const RecipeCraftingTimeAssertionSchema = z.strictObject({
  type: z.literal("recipe_crafting_time_matches"),
  ...recipeAddressFields,
  expectation: ScalarOperationSchema,
});

const recipeResultAddressFields = {
  recipeName: z.string().min(1).max(160).regex(factorioIdentifier),
  resultType: z.literal("item"),
  resultName: z.string().min(1).max(160).regex(factorioIdentifier),
} as const;

export const RecipeResultChangeSchema = z.strictObject({
  type: z.literal("recipe_result"),
  ...recipeResultAddressFields,
  operation: ScalarOperationSchema,
});

export const RecipeResultAssertionSchema = z.strictObject({
  type: z.literal("recipe_result_matches"),
  ...recipeResultAddressFields,
  expectation: ScalarOperationSchema,
});

const itemStackAddressFields = {
  itemName: z.string().min(1).max(160).regex(factorioIdentifier),
} as const;

export const ItemStackSizeChangeSchema = z.strictObject({
  type: z.literal("item_stack_size"),
  ...itemStackAddressFields,
  operation: ScalarOperationSchema,
});

export const ItemStackSizeAssertionSchema = z.strictObject({
  type: z.literal("item_stack_size_matches"),
  ...itemStackAddressFields,
  expectation: ScalarOperationSchema,
});

const technologyAddressFields = {
  technologyName: z.string().min(1).max(160).regex(factorioIdentifier),
} as const;

export const TechnologyCostChangeSchema = z.strictObject({
  type: z.literal("technology_cost"),
  ...technologyAddressFields,
  operation: ScalarOperationSchema,
});

export const TechnologyCostAssertionSchema = z.strictObject({
  type: z.literal("technology_cost_matches"),
  ...technologyAddressFields,
  expectation: ScalarOperationSchema,
});

export const PrerequisiteOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("add") }),
  z.strictObject({ type: z.literal("remove") }),
]);

const technologyPrerequisiteAddressFields = {
  technologyName: z.string().min(1).max(160).regex(factorioIdentifier),
  prerequisiteName: z.string().min(1).max(160).regex(factorioIdentifier),
} as const;

export const TechnologyPrerequisiteChangeSchema = z.strictObject({
  type: z.literal("technology_prerequisite"),
  ...technologyPrerequisiteAddressFields,
  operation: PrerequisiteOperationSchema,
});

export const TechnologyPrerequisiteAssertionSchema = z.strictObject({
  type: z.literal("technology_prerequisite_matches"),
  ...technologyPrerequisiteAddressFields,
  expectation: PrerequisiteOperationSchema,
});

export const ModChangeSchema = z.discriminatedUnion("type", [
  PrototypePropertyChangeSchema,
  RecipeIngredientChangeSchema,
  RecipeCraftingTimeChangeSchema,
  RecipeResultChangeSchema,
  ItemStackSizeChangeSchema,
  TechnologyCostChangeSchema,
  TechnologyPrerequisiteChangeSchema,
]);

export const ModAssertionSchema = z.discriminatedUnion("type", [
  PrototypePropertyAssertionSchema,
  RecipeIngredientAssertionSchema,
  RecipeCraftingTimeAssertionSchema,
  RecipeResultAssertionSchema,
  ItemStackSizeAssertionSchema,
  TechnologyCostAssertionSchema,
  TechnologyPrerequisiteAssertionSchema,
]);

function operationKey(operation: z.infer<typeof ScalarOperationSchema>) {
  return operation.type === "set"
    ? `set:${operation.value}`
    : `multiply:${operation.factor}`;
}

function addSemanticIssues<TChange, TAssertion>(
  changes: readonly TChange[],
  assertions: readonly TAssertion[],
  changeAddress: (value: TChange) => string,
  assertionAddress: (value: TAssertion) => string,
  changeOperation: (value: TChange) => z.infer<typeof ScalarOperationSchema>,
  assertionOperation: (value: TAssertion) => z.infer<typeof ScalarOperationSchema>,
  ctx: z.RefinementCtx,
  duplicateMessage: string,
): void {
  const changeAddresses = new Set<string>();
  const expectedSemantics = new Set<string>();

  for (const [index, change] of changes.entries()) {
    const address = changeAddress(change);
    if (changeAddresses.has(address)) {
      ctx.addIssue({ code: "custom", path: ["changes", index], message: duplicateMessage });
    }
    changeAddresses.add(address);
    expectedSemantics.add(`${address}\u0000${operationKey(changeOperation(change))}`);
  }

  const seenAssertions = new Set<string>();
  for (const [index, assertion] of assertions.entries()) {
    const key = `${assertionAddress(assertion)}\u0000${operationKey(assertionOperation(assertion))}`;
    if (seenAssertions.has(key)) {
      ctx.addIssue({
        code: "custom",
        path: ["assertions", index],
        message: "Duplicate semantic assertion",
      });
    }
    seenAssertions.add(key);
    if (!expectedSemantics.has(key)) {
      ctx.addIssue({
        code: "custom",
        path: ["assertions", index],
        message: "Assertion does not match a requested change",
      });
    }
  }

  for (const [index, change] of changes.entries()) {
    const expected = `${changeAddress(change)}\u0000${operationKey(changeOperation(change))}`;
    if (!seenAssertions.has(expected)) {
      ctx.addIssue({
        code: "custom",
        path: ["assertions"],
        message: `Missing matching assertion for change ${index}`,
      });
    }
  }
}

export const PrototypePropertyModSpecSchema = z
  .strictObject({
    ...baseSpecFields,
    capability: z.literal("prototype_property"),
    changes: z.array(PrototypePropertyChangeSchema).min(1).max(16),
    assertions: z.array(PrototypePropertyAssertionSchema).min(1).max(16),
  })
  .superRefine((spec, ctx) => {
    addSemanticIssues(
      spec.changes,
      spec.assertions,
      (value) => `${value.prototypeType}\u0000${value.prototypeName}\u0000${value.property}`,
      (value) => `${value.prototypeType}\u0000${value.prototypeName}\u0000${value.property}`,
      (value) => value.operation,
      (value) => value.expectation,
      ctx,
      "Duplicate prototype property change",
    );
  });

export const RecipeIngredientModSpecSchema = z
  .strictObject({
    ...baseSpecFields,
    capability: z.literal("recipe_ingredient"),
    changes: z.array(RecipeIngredientChangeSchema).min(1).max(16),
    assertions: z.array(RecipeIngredientAssertionSchema).min(1).max(16),
  })
  .superRefine((spec, ctx) => {
    addSemanticIssues(
      spec.changes,
      spec.assertions,
      (value) => `${value.recipeName}\u0000${value.ingredientType}\u0000${value.ingredientName}`,
      (value) => `${value.recipeName}\u0000${value.ingredientType}\u0000${value.ingredientName}`,
      (value) => value.operation,
      (value) => value.expectation,
      ctx,
      "Duplicate recipe ingredient change",
    );
  });

export const RecipeCraftingTimeModSpecSchema = z
  .strictObject({
    ...baseSpecFields,
    capability: z.literal("recipe_crafting_time"),
    changes: z.array(RecipeCraftingTimeChangeSchema).min(1).max(16),
    assertions: z.array(RecipeCraftingTimeAssertionSchema).min(1).max(16),
  })
  .superRefine((spec, ctx) => {
    addSemanticIssues(spec.changes, spec.assertions, (v) => v.recipeName, (v) => v.recipeName, (v) => v.operation, (v) => v.expectation, ctx, "Duplicate recipe crafting time change");
  });

export const RecipeResultModSpecSchema = z
  .strictObject({
    ...baseSpecFields,
    capability: z.literal("recipe_result"),
    changes: z.array(RecipeResultChangeSchema).min(1).max(16),
    assertions: z.array(RecipeResultAssertionSchema).min(1).max(16),
  })
  .superRefine((spec, ctx) => {
    addSemanticIssues(spec.changes, spec.assertions, (v) => `${v.recipeName}\u0000${v.resultType}\u0000${v.resultName}`, (v) => `${v.recipeName}\u0000${v.resultType}\u0000${v.resultName}`, (v) => v.operation, (v) => v.expectation, ctx, "Duplicate recipe result change");
  });

export const ItemStackSizeModSpecSchema = z
  .strictObject({
    ...baseSpecFields,
    capability: z.literal("item_stack_size"),
    changes: z.array(ItemStackSizeChangeSchema).min(1).max(16),
    assertions: z.array(ItemStackSizeAssertionSchema).min(1).max(16),
  })
  .superRefine((spec, ctx) => {
    addSemanticIssues(spec.changes, spec.assertions, (v) => v.itemName, (v) => v.itemName, (v) => v.operation, (v) => v.expectation, ctx, "Duplicate item stack size change");
  });

export const TechnologyCostModSpecSchema = z
  .strictObject({
    ...baseSpecFields,
    capability: z.literal("technology_cost"),
    changes: z.array(TechnologyCostChangeSchema).min(1).max(16),
    assertions: z.array(TechnologyCostAssertionSchema).min(1).max(16),
  })
  .superRefine((spec, ctx) => {
    addSemanticIssues(
      spec.changes,
      spec.assertions,
      (value) => value.technologyName,
      (value) => value.technologyName,
      (value) => value.operation,
      (value) => value.expectation,
      ctx,
      "Duplicate technology cost change",
    );
  });

export const TechnologyPrerequisiteModSpecSchema = z
  .strictObject({
    ...baseSpecFields,
    capability: z.literal("technology_prerequisite"),
    changes: z.array(TechnologyPrerequisiteChangeSchema).min(1).max(16),
    assertions: z.array(TechnologyPrerequisiteAssertionSchema).min(1).max(16),
  })
  .superRefine((spec, ctx) => {
    const changeAddresses = new Set<string>();
    const expectedSemantics = new Set<string>();
    for (const [index, change] of spec.changes.entries()) {
      const address = `${change.technologyName}\u0000${change.prerequisiteName}`;
      if (changeAddresses.has(address)) {
        ctx.addIssue({
          code: "custom",
          path: ["changes", index],
          message: "Duplicate technology prerequisite change",
        });
      }
      changeAddresses.add(address);
      expectedSemantics.add(`${address}\u0000${change.operation.type}`);
    }

    const seenAssertions = new Set<string>();
    for (const [index, assertion] of spec.assertions.entries()) {
      const key = `${assertion.technologyName}\u0000${assertion.prerequisiteName}\u0000${assertion.expectation.type}`;
      if (seenAssertions.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["assertions", index],
          message: "Duplicate semantic assertion",
        });
      }
      seenAssertions.add(key);
      if (!expectedSemantics.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["assertions", index],
          message: "Assertion does not match a requested change",
        });
      }
    }

    for (const [index, change] of spec.changes.entries()) {
      const expected = `${change.technologyName}\u0000${change.prerequisiteName}\u0000${change.operation.type}`;
      if (!seenAssertions.has(expected)) {
        ctx.addIssue({
          code: "custom",
          path: ["assertions"],
          message: `Missing matching assertion for change ${index}`,
        });
      }
    }
  });

function mixedChangeAddress(change: z.infer<typeof ModChangeSchema>): string {
  switch (change.type) {
    case "prototype_property":
      return `${change.type}\u0000${change.prototypeType}\u0000${change.prototypeName}\u0000${change.property}`;
    case "recipe_ingredient":
      return `${change.type}\u0000${change.recipeName}\u0000${change.ingredientType}\u0000${change.ingredientName}`;
    case "recipe_crafting_time":
      return `${change.type}\u0000${change.recipeName}`;
    case "recipe_result":
      return `${change.type}\u0000${change.recipeName}\u0000${change.resultType}\u0000${change.resultName}`;
    case "item_stack_size":
      return `${change.type}\u0000${change.itemName}`;
    case "technology_cost":
      return `${change.type}\u0000${change.technologyName}`;
    case "technology_prerequisite":
      return `${change.type}\u0000${change.technologyName}\u0000${change.prerequisiteName}`;
  }
}

function mixedChangeSemanticKey(change: z.infer<typeof ModChangeSchema>): string {
  const operation = change.operation;
  const operationPart =
    operation.type === "add" || operation.type === "remove"
      ? operation.type
      : operationKey(operation);
  return `${mixedChangeAddress(change)}\u0000${operationPart}`;
}

function mixedAssertionSemanticKey(assertion: z.infer<typeof ModAssertionSchema>): string {
  switch (assertion.type) {
    case "prototype_property_matches":
      return `prototype_property\u0000${assertion.prototypeType}\u0000${assertion.prototypeName}\u0000${assertion.property}\u0000${operationKey(assertion.expectation)}`;
    case "recipe_ingredient_matches":
      return `recipe_ingredient\u0000${assertion.recipeName}\u0000${assertion.ingredientType}\u0000${assertion.ingredientName}\u0000${operationKey(assertion.expectation)}`;
    case "recipe_crafting_time_matches":
      return `recipe_crafting_time\u0000${assertion.recipeName}\u0000${operationKey(assertion.expectation)}`;
    case "recipe_result_matches":
      return `recipe_result\u0000${assertion.recipeName}\u0000${assertion.resultType}\u0000${assertion.resultName}\u0000${operationKey(assertion.expectation)}`;
    case "item_stack_size_matches":
      return `item_stack_size\u0000${assertion.itemName}\u0000${operationKey(assertion.expectation)}`;
    case "technology_cost_matches":
      return `technology_cost\u0000${assertion.technologyName}\u0000${operationKey(assertion.expectation)}`;
    case "technology_prerequisite_matches":
      return `technology_prerequisite\u0000${assertion.technologyName}\u0000${assertion.prerequisiteName}\u0000${assertion.expectation.type}`;
  }
}

export const MixedModSpecSchema = z
  .strictObject({
    ...baseSpecFields,
    capability: z.literal("mixed"),
    changes: z.array(ModChangeSchema).min(2).max(32),
    assertions: z.array(ModAssertionSchema).min(2).max(32),
  })
  .superRefine((spec, ctx) => {
    if (new Set(spec.changes.map((change) => change.type)).size < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["changes"],
        message: "Mixed ModSpec must contain at least two capability families",
      });
    }

    const addresses = new Set<string>();
    const expectedSemantics = new Set<string>();
    for (const [index, change] of spec.changes.entries()) {
      const address = mixedChangeAddress(change);
      if (addresses.has(address)) {
        ctx.addIssue({ code: "custom", path: ["changes", index], message: "Duplicate mixed change" });
      }
      addresses.add(address);
      expectedSemantics.add(mixedChangeSemanticKey(change));
    }

    const seenAssertions = new Set<string>();
    for (const [index, assertion] of spec.assertions.entries()) {
      const key = mixedAssertionSemanticKey(assertion);
      if (seenAssertions.has(key)) {
        ctx.addIssue({ code: "custom", path: ["assertions", index], message: "Duplicate semantic assertion" });
      }
      seenAssertions.add(key);
      if (!expectedSemantics.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["assertions", index],
          message: "Assertion does not match a requested change",
        });
      }
    }

    for (const [index, change] of spec.changes.entries()) {
      if (!seenAssertions.has(mixedChangeSemanticKey(change))) {
        ctx.addIssue({
          code: "custom",
          path: ["assertions"],
          message: `Missing matching assertion for change ${index}`,
        });
      }
    }
  });

export const ModSpecSchema = z.union([
  PrototypePropertyModSpecSchema,
  RecipeIngredientModSpecSchema,
  RecipeCraftingTimeModSpecSchema,
  RecipeResultModSpecSchema,
  ItemStackSizeModSpecSchema,
  TechnologyCostModSpecSchema,
  TechnologyPrerequisiteModSpecSchema,
  MixedModSpecSchema,
]);

export type GameTarget = z.infer<typeof GameTargetSchema>;
export type ScalarOperation = z.infer<typeof ScalarOperationSchema>;
export type PrototypePropertyChange = z.infer<typeof PrototypePropertyChangeSchema>;
export type PrototypePropertyAssertion = z.infer<typeof PrototypePropertyAssertionSchema>;
export type RecipeIngredientChange = z.infer<typeof RecipeIngredientChangeSchema>;
export type RecipeIngredientAssertion = z.infer<typeof RecipeIngredientAssertionSchema>;
export type RecipeCraftingTimeChange = z.infer<typeof RecipeCraftingTimeChangeSchema>;
export type RecipeCraftingTimeAssertion = z.infer<typeof RecipeCraftingTimeAssertionSchema>;
export type RecipeResultChange = z.infer<typeof RecipeResultChangeSchema>;
export type RecipeResultAssertion = z.infer<typeof RecipeResultAssertionSchema>;
export type ItemStackSizeChange = z.infer<typeof ItemStackSizeChangeSchema>;
export type ItemStackSizeAssertion = z.infer<typeof ItemStackSizeAssertionSchema>;
export type TechnologyCostChange = z.infer<typeof TechnologyCostChangeSchema>;
export type TechnologyCostAssertion = z.infer<typeof TechnologyCostAssertionSchema>;
export type PrerequisiteOperation = z.infer<typeof PrerequisiteOperationSchema>;
export type TechnologyPrerequisiteChange = z.infer<typeof TechnologyPrerequisiteChangeSchema>;
export type TechnologyPrerequisiteAssertion = z.infer<typeof TechnologyPrerequisiteAssertionSchema>;
export type ModChange = z.infer<typeof ModChangeSchema>;
export type ModAssertion = z.infer<typeof ModAssertionSchema>;
export type PrototypePropertyModSpec = z.infer<typeof PrototypePropertyModSpecSchema>;
export type RecipeIngredientModSpec = z.infer<typeof RecipeIngredientModSpecSchema>;
export type RecipeCraftingTimeModSpec = z.infer<typeof RecipeCraftingTimeModSpecSchema>;
export type RecipeResultModSpec = z.infer<typeof RecipeResultModSpecSchema>;
export type ItemStackSizeModSpec = z.infer<typeof ItemStackSizeModSpecSchema>;
export type TechnologyCostModSpec = z.infer<typeof TechnologyCostModSpecSchema>;
export type TechnologyPrerequisiteModSpec = z.infer<typeof TechnologyPrerequisiteModSpecSchema>;
export type MixedModSpec = z.infer<typeof MixedModSpecSchema>;
export type ModSpec = z.infer<typeof ModSpecSchema>;
