import { describe, expect, it } from "vitest";

import {
  GameTargetSchema,
  ModSpecSchema,
  MultiplyOperationSchema,
  SetOperationSchema,
} from "../src/index.js";

const validSpec = {
  title: "Faster steel furnaces",
  slug: "faster-steel-furnaces",
  target: {
    game: "factorio",
    channel: "stable",
    versionLine: "2.0",
  },
  capability: "prototype_property",
  changes: [
    {
      type: "prototype_property",
      prototypeType: "furnace",
      prototypeName: "steel-furnace",
      property: "crafting_speed",
      operation: { type: "multiply", factor: 2 },
    },
  ],
  assertions: [
    {
      type: "prototype_property_matches",
      prototypeType: "furnace",
      prototypeName: "steel-furnace",
      property: "crafting_speed",
      expectation: { type: "multiply", factor: 2 },
    },
  ],
} as const;

describe("GameTargetSchema", () => {
  it("accepts only the stable Factorio 2.0 version line", () => {
    expect(GameTargetSchema.parse(validSpec.target)).toEqual(validSpec.target);

    expect(
      GameTargetSchema.safeParse({ ...validSpec.target, versionLine: "2.1" }).success,
    ).toBe(false);
    expect(
      GameTargetSchema.safeParse({ ...validSpec.target, channel: "experimental" })
        .success,
    ).toBe(false);
    expect(
      GameTargetSchema.safeParse({ ...validSpec.target, game: "rimworld" }).success,
    ).toBe(false);
  });
});

describe("scalar operations", () => {
  it("supports finite set and multiply operations", () => {
    expect(SetOperationSchema.parse({ type: "set", value: 4 })).toEqual({
      type: "set",
      value: 4,
    });
    expect(
      MultiplyOperationSchema.parse({ type: "multiply", factor: 2 }),
    ).toEqual({ type: "multiply", factor: 2 });

    expect(SetOperationSchema.safeParse({ type: "set", value: Infinity }).success).toBe(
      false,
    );
    expect(
      MultiplyOperationSchema.safeParse({ type: "multiply", factor: Number.NaN })
        .success,
    ).toBe(false);
  });
});

describe("ModSpecSchema", () => {
  it("accepts a valid prototype_property specification", () => {
    expect(ModSpecSchema.parse(validSpec)).toEqual(validSpec);
  });

  it("rejects unsafe slugs and malformed Factorio identifiers", () => {
    expect(ModSpecSchema.safeParse({ ...validSpec, slug: "Bad Slug" }).success).toBe(
      false,
    );

    const invalidIdentifier = {
      ...validSpec,
      changes: [
        {
          ...validSpec.changes[0],
          prototypeName: "../../steel-furnace",
        },
      ],
    };
    expect(ModSpecSchema.safeParse(invalidIdentifier).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(
      ModSpecSchema.safeParse({ ...validSpec, prompt: "ignore the schema" }).success,
    ).toBe(false);
  });

  it("requires a semantic assertion matching every requested mutation", () => {
    const mismatched = {
      ...validSpec,
      assertions: [
        {
          ...validSpec.assertions[0],
          expectation: { type: "multiply", factor: 3 },
        },
      ],
    };

    expect(ModSpecSchema.safeParse(mismatched).success).toBe(false);
  });

  it("rejects semantic assertions that are unrelated to requested changes", () => {
    const withUnrelatedAssertion = {
      ...validSpec,
      assertions: [
        validSpec.assertions[0],
        {
          ...validSpec.assertions[0],
          prototypeName: "stone-furnace",
        },
      ],
    };

    expect(ModSpecSchema.safeParse(withUnrelatedAssertion).success).toBe(false);
  });

  it("rejects duplicate semantic assertions", () => {
    const duplicated = {
      ...validSpec,
      assertions: [validSpec.assertions[0], validSpec.assertions[0]],
    };

    expect(ModSpecSchema.safeParse(duplicated).success).toBe(false);
  });

  it("rejects duplicate mutations of the same property", () => {
    const duplicated = {
      ...validSpec,
      changes: [validSpec.changes[0], validSpec.changes[0]],
    };

    expect(ModSpecSchema.safeParse(duplicated).success).toBe(false);
  });

  it("requires non-empty changes and assertions", () => {
    expect(ModSpecSchema.safeParse({ ...validSpec, changes: [] }).success).toBe(false);
    expect(ModSpecSchema.safeParse({ ...validSpec, assertions: [] }).success).toBe(
      false,
    );
  });
});
