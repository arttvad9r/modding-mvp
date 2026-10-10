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

export const ModSpecSchema = z.union([
  PrototypePropertyModSpecSchema,
  RecipeIngredientModSpecSchema,
  TechnologyCostModSpecSchema,
  TechnologyPrerequisiteModSpecSchema,
]);

export type GameTarget = z.infer<typeof GameTargetSchema>;
export type ScalarOperation = z.infer<typeof ScalarOperationSchema>;
export type PrototypePropertyChange = z.infer<typeof PrototypePropertyChangeSchema>;
export type PrototypePropertyAssertion = z.infer<typeof PrototypePropertyAssertionSchema>;
export type RecipeIngredientChange = z.infer<typeof RecipeIngredientChangeSchema>;
export type RecipeIngredientAssertion = z.infer<typeof RecipeIngredientAssertionSchema>;
export type TechnologyCostChange = z.infer<typeof TechnologyCostChangeSchema>;
export type TechnologyCostAssertion = z.infer<typeof TechnologyCostAssertionSchema>;
export type PrerequisiteOperation = z.infer<typeof PrerequisiteOperationSchema>;
export type TechnologyPrerequisiteChange = z.infer<typeof TechnologyPrerequisiteChangeSchema>;
export type TechnologyPrerequisiteAssertion = z.infer<typeof TechnologyPrerequisiteAssertionSchema>;
export type PrototypePropertyModSpec = z.infer<typeof PrototypePropertyModSpecSchema>;
export type RecipeIngredientModSpec = z.infer<typeof RecipeIngredientModSpecSchema>;
export type TechnologyCostModSpec = z.infer<typeof TechnologyCostModSpecSchema>;
export type TechnologyPrerequisiteModSpec = z.infer<typeof TechnologyPrerequisiteModSpecSchema>;
export type ModSpec = z.infer<typeof ModSpecSchema>;
