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

function mutationKey(value: {
  prototypeType: string;
  prototypeName: string;
  property: string;
}) {
  return `${value.prototypeType}\u0000${value.prototypeName}\u0000${value.property}`;
}

function operationKey(operation: z.infer<typeof ScalarOperationSchema>) {
  return operation.type === "set"
    ? `set:${operation.value}`
    : `multiply:${operation.factor}`;
}

function semanticKey(
  address: {
    prototypeType: string;
    prototypeName: string;
    property: string;
  },
  operation: z.infer<typeof ScalarOperationSchema>,
) {
  return `${mutationKey(address)}\u0000${operationKey(operation)}`;
}

export const ModSpecSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(120),
    slug: z.string().min(1).max(80).regex(safeSlug),
    target: GameTargetSchema,
    capability: z.literal("prototype_property"),
    changes: z.array(PrototypePropertyChangeSchema).min(1).max(16),
    assertions: z.array(PrototypePropertyAssertionSchema).min(1).max(16),
  })
  .superRefine((spec, ctx) => {
    const changeAddresses = new Set<string>();
    const expectedSemantics = new Set<string>();

    for (const [index, change] of spec.changes.entries()) {
      const address = mutationKey(change);
      if (changeAddresses.has(address)) {
        ctx.addIssue({
          code: "custom",
          path: ["changes", index],
          message: "Duplicate prototype property change",
        });
      }
      changeAddresses.add(address);
      expectedSemantics.add(semanticKey(change, change.operation));
    }

    const seenAssertions = new Set<string>();
    for (const [index, assertion] of spec.assertions.entries()) {
      const key = semanticKey(assertion, assertion.expectation);
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
      const expected = semanticKey(change, change.operation);
      if (!seenAssertions.has(expected)) {
        ctx.addIssue({
          code: "custom",
          path: ["assertions"],
          message: `Missing matching assertion for change ${index}`,
        });
      }
    }
  });

export type GameTarget = z.infer<typeof GameTargetSchema>;
export type ScalarOperation = z.infer<typeof ScalarOperationSchema>;
export type PrototypePropertyChange = z.infer<typeof PrototypePropertyChangeSchema>;
export type PrototypePropertyAssertion = z.infer<
  typeof PrototypePropertyAssertionSchema
>;
export type ModSpec = z.infer<typeof ModSpecSchema>;
