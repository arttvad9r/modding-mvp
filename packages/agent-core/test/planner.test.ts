import { ProjectError, type ModSpec } from "@project/domain";
import type { LlmJsonRequest, LlmJsonResponse, LlmProvider } from "@project/llm";
import { describe, expect, it } from "vitest";

import {
  buildPlannerSystemPrompt,
  buildRevisionSystemPrompt,
  planFactorioPrompt,
  planFactorioRevision,
} from "../src/index.js";

class SequenceProvider implements LlmProvider {
  readonly requests: LlmJsonRequest[] = [];
  private index = 0;

  constructor(private readonly responses: readonly (LlmJsonResponse | Error)[]) {}

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    this.requests.push(request);
    const response = this.responses[this.index];
    this.index += 1;
    if (!response) throw new Error("No fake response configured");
    if (response instanceof Error) throw response;
    return response;
  }
}

function response(value: unknown, inputTokens = 20, outputTokens = 10): LlmJsonResponse {
  return {
    value,
    provider: "fake",
    model: "fake-model",
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd: 0.001,
    },
    durationMs: 5,
  };
}

function fasterSteelDraft() {
  return {
    status: "supported",
    title: "Faster steel furnaces",
    slug: "faster-steel-furnaces",
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
  } as const;
}

function mixedFastStartDraft() {
  return {
    status: "supported",
    title: "Fast start",
    slug: "fast-start",
    changes: [
      {
        type: "prototype_property",
        prototypeType: "assembling-machine",
        prototypeName: "assembling-machine-2",
        property: "crafting_speed",
        operation: { type: "multiply", factor: 2 },
      },
      {
        type: "technology_cost",
        technologyName: "automation",
        operation: { type: "multiply", factor: 0.5 },
      },
    ],
  } as const;
}


function contentTreeDraft() {
  return {
    status: "supported",
    title: "Reinforced furnace progression",
    slug: "reinforced-furnace-progression",
    changes: [
      { type: "new_item", baseItemName: "steel-plate", name: "custom-reinforced-plate", displayName: "Reinforced Plate", stackSize: 100, recipeCraftingTime: 2, recipeIngredients: [{ itemName: "steel-plate", amount: 2 }, { itemName: "plastic-bar", amount: 5 }], recipeResultAmount: 1, unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
      { type: "new_machine", machineType: "furnace", basePrototypeName: "electric-furnace", name: "custom-reinforced-furnace", displayName: "Reinforced Furnace", speed: 4, energyUsageKw: 500, moduleSlots: 4, itemStackSize: 50, recipeCraftingTime: 6, recipeIngredients: [{ itemName: "electric-furnace", amount: 1 }, { itemName: "custom-reinforced-plate", amount: 10 }, { itemName: "processing-unit", amount: 5 }], unlock: { type: "existing_technology", technologyName: "advanced-material-processing-2" } },
    ],
  } as const;
}


function newRecipeDraft() {
  return {
    status: "supported",
    title: "Steel gears recipe",
    slug: "steel-gears-recipe",
    changes: [{
      type: "new_recipe",
      name: "custom-steel-gears",
      displayName: "Steel Gears",
      energyRequired: 1,
      ingredients: [{ itemName: "steel-plate", amount: 1 }],
      resultItemName: "iron-gear-wheel",
      resultAmount: 5,
      unlock: { type: "existing_technology", technologyName: "steel-processing" },
    }],
  } as const;
}


function newMachineDraft() {
  return {
    status: "supported",
    title: "Advanced electric furnace",
    slug: "advanced-electric-furnace",
    changes: [{
      type: "new_machine",
      machineType: "furnace",
      basePrototypeName: "electric-furnace",
      name: "custom-advanced-electric-furnace",
      displayName: "Advanced Electric Furnace",
      speed: 4,
      energyUsageKw: 540,
      moduleSlots: 4,
      itemStackSize: 50,
      recipeCraftingTime: 5,
      recipeIngredients: [
        { itemName: "steel-plate", amount: 10 },
        { itemName: "advanced-circuit", amount: 5 },
        { itemName: "stone-brick", amount: 10 },
      ],
      unlock: {
        type: "new_technology",
        displayName: "Advanced Electric Furnace",
        prerequisites: ["advanced-material-processing-2"],
        scienceTier: "chemical",
        count: 300,
        time: 30,
      },
    }],
  } as const;
}

const newMachineSpec = {
  title: "Advanced electric furnace",
  slug: "advanced-electric-furnace",
  target: { game: "factorio", channel: "stable", versionLine: "2.0" },
  capability: "new_machine",
  changes: [{ ...newMachineDraft().changes[0] }],
  assertions: [{ ...newMachineDraft().changes[0], type: "new_machine_matches" }],
} as unknown as ModSpec;


const acceptedSpec: ModSpec = {
  title: "Fast start",
  slug: "fast-start",
  target: { game: "factorio", channel: "stable", versionLine: "2.0" },
  capability: "mixed",
  changes: [
    {
      type: "prototype_property",
      prototypeType: "furnace",
      prototypeName: "steel-furnace",
      property: "crafting_speed",
      operation: { type: "multiply", factor: 1.5 },
    },
    {
      type: "technology_cost",
      technologyName: "automation",
      operation: { type: "multiply", factor: 0.5 },
    },
  ],
  assertions: [
    {
      type: "prototype_property_matches",
      prototypeType: "furnace",
      prototypeName: "steel-furnace",
      property: "crafting_speed",
      expectation: { type: "multiply", factor: 1.5 },
    },
    {
      type: "technology_cost_matches",
      technologyName: "automation",
      expectation: { type: "multiply", factor: 0.5 },
    },
  ],
};

describe("Planner prompt contract", () => {
  it("builds supported scope from the Factorio capability registry", () => {
    const prompt = buildPlannerSystemPrompt();
    expect(prompt).toContain("prototype_property");
    expect(prompt).toContain("recipe_ingredient");
    expect(prompt).toContain("recipe_crafting_time");
    expect(prompt).toContain("recipe_result");
    expect(prompt).toContain("item_stack_size");
    expect(prompt).toContain("new_machine");
    expect(prompt).toContain("new_recipe");
    expect(prompt).toContain("new_item");
    expect(prompt).toContain("new_item");
    expect(prompt).toContain("technology_cost");
    expect(prompt).toContain("technology_prerequisite");
    expect(prompt).toContain("new_machine");
    expect(prompt).toContain("custom-");
    expect(prompt).toContain("steel-furnace");
    expect(prompt).toContain("Do not approximate");
  });
});

describe("planFactorioPrompt", () => {
  it("turns a supported structured draft into a fully validated ModSpec", async () => {
    const provider = new SequenceProvider([response(fasterSteelDraft())]);
    const result = await planFactorioPrompt({
      provider,
      prompt: "Make steel furnaces twice as fast",
    });

    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("expected supported result");
    expect(result.modSpec.target).toEqual({ game: "factorio", channel: "stable", versionLine: "2.0" });
    expect(result.modSpec.assertions).toEqual([
      {
        type: "prototype_property_matches",
        prototypeType: "furnace",
        prototypeName: "steel-furnace",
        property: "crafting_speed",
        expectation: { type: "multiply", factor: 2 },
      },
    ]);
    expect(result.attempts).toHaveLength(1);
    expect(result.usage.totalTokens).toBe(30);
  });

  it("composes multiple capability families into one mixed ModSpec", async () => {
    const provider = new SequenceProvider([response(mixedFastStartDraft())]);
    const result = await planFactorioPrompt({
      provider,
      prompt: "Double assembling machine 2 speed and halve Automation research cost",
    });

    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("expected supported result");
    expect(result.modSpec.capability).toBe("mixed");
    expect(result.modSpec.changes).toHaveLength(2);
    expect(result.modSpec.assertions).toHaveLength(2);
  });

  it("derives assertions for M6A recipe-time/result/stack mixed bundles", async () => {
    const provider = new SequenceProvider([response({
      status: "supported",
      title: "Throughput bundle",
      slug: "throughput-bundle",
      changes: [
        { type: "recipe_crafting_time", recipeName: "iron-gear-wheel", operation: { type: "multiply", factor: 0.5 } },
        { type: "recipe_result", recipeName: "transport-belt", resultType: "item", resultName: "transport-belt", operation: { type: "set", value: 4 } },
        { type: "item_stack_size", itemName: "electronic-circuit", operation: { type: "set", value: 500 } },
      ],
    })]);
    const result = await planFactorioPrompt({
      provider,
      prompt: "Make gears craft twice as fast, belts output 4, and circuit stacks 500",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("expected supported result");
    expect(result.modSpec.capability).toBe("mixed");
    expect(result.modSpec.assertions).toEqual([
      { type: "recipe_crafting_time_matches", recipeName: "iron-gear-wheel", expectation: { type: "multiply", factor: 0.5 } },
      { type: "recipe_result_matches", recipeName: "transport-belt", resultType: "item", resultName: "transport-belt", expectation: { type: "set", value: 4 } },
      { type: "item_stack_size_matches", itemName: "electronic-circuit", expectation: { type: "set", value: 500 } },
    ]);
  });

  it("derives a fully asserted new machine content bundle", async () => {
    const provider = new SequenceProvider([response(newMachineDraft())]);
    const result = await planFactorioPrompt({
      provider,
      prompt: "Add an advanced electric furnace based on the electric furnace, twice as fast, using 540 kW, with a new technology after Advanced material processing 2",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("expected supported result");
    expect(result.modSpec.capability).toBe("new_machine");
    expect(result.modSpec.changes[0]).toMatchObject({
      type: "new_machine",
      name: "custom-advanced-electric-furnace",
      speed: 4,
    });
    expect(result.modSpec.assertions[0]).toMatchObject({
      type: "new_machine_matches",
      name: "custom-advanced-electric-furnace",
      speed: 4,
    });
  });

  it("derives a fully asserted alternative recipe", async () => {
    const provider = new SequenceProvider([response(newRecipeDraft())]);
    const result = await planFactorioPrompt({
      provider,
      prompt: "Create a Steel Gears recipe where one steel plate makes five iron gears in one second, unlocked by Steel processing",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("expected supported result");
    expect(result.modSpec.capability).toBe("new_recipe");
    expect(result.modSpec.changes[0]).toMatchObject({ type: "new_recipe", name: "custom-steel-gears", resultAmount: 5 });
    expect(result.modSpec.assertions[0]).toMatchObject({ type: "new_recipe_matches", name: "custom-steel-gears", resultAmount: 5 });
  });

  it("accepts a content tree where a declared custom item feeds a new machine", async () => {
    const provider = new SequenceProvider([response(contentTreeDraft())]);
    const result = await planFactorioPrompt({ provider, prompt: "Create Reinforced Plate from steel and plastic, then use it to craft a Reinforced Furnace" });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("expected supported result");
    expect(result.modSpec.capability).toBe("mixed");
    expect(result.modSpec.changes).toHaveLength(2);
    expect(result.modSpec.changes[0]).toMatchObject({ type: "new_item", name: "custom-reinforced-plate" });
    expect(result.modSpec.changes[1]).toMatchObject({ type: "new_machine", recipeIngredients: expect.arrayContaining([{ itemName: "custom-reinforced-plate", amount: 10 }]) });
  });

  it("rejects an undeclared custom item reference", async () => {
    const invalid = contentTreeDraft();
    const provider = new SequenceProvider([
      response({ status: "supported", title: invalid.title, slug: invalid.slug, changes: [invalid.changes[1]] }),
      response({ status: "unsupported", reason: "The custom ingredient is not declared in this request." }),
    ]);
    const result = await planFactorioPrompt({ provider, prompt: "Create a furnace that uses my made-up custom plate" });
    expect(result).toMatchObject({ status: "unsupported" });
    expect(provider.requests).toHaveLength(2);
  });

  it("rejects explicit universal category scopes before calling the model", async () => {
    const provider = new SequenceProvider([]);
    const result = await planFactorioPrompt({ provider, prompt: "Make all inserters twice as fast" });

    expect(result).toMatchObject({ status: "unsupported" });
    if (result.status !== "unsupported") throw new Error("expected unsupported result");
    expect(result.reason).toContain("Broad category request for inserters");
    expect(provider.requests).toHaveLength(0);
  });

  it("rejects Russian universal category scopes before calling the model", async () => {
    const provider = new SequenceProvider([]);
    const result = await planFactorioPrompt({ provider, prompt: "Ускорь все манипуляторы в 2 раза" });

    expect(result).toMatchObject({ status: "unsupported" });
    if (result.status !== "unsupported") throw new Error("expected unsupported result");
    expect(result.reason).toContain("манипуляторы");
    expect(result.reason).toContain("конкретные цели");
    expect(provider.requests).toHaveLength(0);
  });

  it("rejects generic plural category wording after structured planning", async () => {
    const provider = new SequenceProvider([response({
      status: "supported",
      title: "Faster inserters",
      slug: "faster-inserters",
      changes: [
        { type: "prototype_property", prototypeType: "inserter", prototypeName: "inserter", property: "extension_speed", operation: { type: "multiply", factor: 2 } },
        { type: "prototype_property", prototypeType: "inserter", prototypeName: "inserter", property: "rotation_speed", operation: { type: "multiply", factor: 2 } },
      ],
    })]);
    const result = await planFactorioPrompt({ provider, prompt: "Make inserters twice as fast" });

    expect(result).toMatchObject({ status: "unsupported" });
    if (result.status !== "unsupported") throw new Error("expected unsupported result");
    expect(result.reason).toContain("Broad category request for inserters");
    expect(provider.requests).toHaveLength(1);
  });

  it("rejects Russian generic plural category wording after structured planning", async () => {
    const provider = new SequenceProvider([response({
      status: "supported",
      title: "Быстрые манипуляторы",
      slug: "fast-inserters-ru",
      changes: [
        { type: "prototype_property", prototypeType: "inserter", prototypeName: "inserter", property: "extension_speed", operation: { type: "multiply", factor: 2 } },
        { type: "prototype_property", prototypeType: "inserter", prototypeName: "inserter", property: "rotation_speed", operation: { type: "multiply", factor: 2 } },
      ],
    })]);
    const result = await planFactorioPrompt({ provider, prompt: "Ускорь манипуляторы в 2 раза" });

    expect(result).toMatchObject({ status: "unsupported" });
    if (result.status !== "unsupported") throw new Error("expected unsupported result");
    expect(result.reason).toContain("манипуляторы");
    expect(provider.requests).toHaveLength(1);
  });

  it("keeps explicit Russian reviewed targets supported", async () => {
    const provider = new SequenceProvider([response(fasterSteelDraft())]);
    const result = await planFactorioPrompt({ provider, prompt: "Ускорь стальные печи в 2 раза" });
    expect(result.status).toBe("supported");
  });

  it("keeps explicit reviewed targets supported", async () => {
    const provider = new SequenceProvider([response(fasterSteelDraft())]);
    const result = await planFactorioPrompt({ provider, prompt: "Make steel furnaces twice as fast" });
    expect(result.status).toBe("supported");
  });

  it("returns an explicit unsupported decision without inventing a ModSpec", async () => {
    const provider = new SequenceProvider([
      response({ status: "unsupported", reason: "Adding a new ore is outside the current registry." }),
    ]);
    const result = await planFactorioPrompt({ provider, prompt: "Add a new uranium-like ore" });

    expect(result).toMatchObject({
      status: "unsupported",
      reason: "Adding a new ore is outside the current registry.",
    });
  });

  it("retries malformed structured output once and aggregates usage", async () => {
    const provider = new SequenceProvider([
      response({ status: "supported" }, 11, 3),
      response(fasterSteelDraft(), 17, 5),
    ]);
    const result = await planFactorioPrompt({
      provider,
      prompt: "Make steel furnaces twice as fast",
    });

    expect(result.status).toBe("supported");
    expect(result.attempts).toHaveLength(2);
    expect(result.usage).toEqual({
      inputTokens: 28,
      outputTokens: 8,
      totalTokens: 36,
      estimatedCostUsd: 0.002,
    });
    expect(provider.requests[1]?.messages.at(-1)?.content).toContain("rejected by the application");
  });

  it("retries when the model invents a target outside the capability registry", async () => {
    const invalidTarget = {
      ...fasterSteelDraft(),
      changes: [
        {
          ...fasterSteelDraft().changes[0],
          prototypeName: "mystery-furnace",
        },
      ],
    };
    const provider = new SequenceProvider([response(invalidTarget), response(fasterSteelDraft())]);
    const result = await planFactorioPrompt({
      provider,
      prompt: "Make steel furnaces twice as fast",
    });

    expect(result.status).toBe("supported");
    expect(result.attempts).toHaveLength(2);
    expect(provider.requests[1]?.messages.at(-1)?.content).toContain("unsupported_capability");
  });


  it("retries a retryable provider schema error", async () => {
    const providerError = new ProjectError({
      code: "schema_error",
      stage: "planning",
      message: "provider JSON parse failed",
      retryable: true,
    });
    const provider = new SequenceProvider([providerError, response(fasterSteelDraft())]);
    const result = await planFactorioPrompt({
      provider,
      prompt: "Make steel furnaces twice as fast",
    });

    expect(result.status).toBe("supported");
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]?.messages.at(-1)?.content).toContain("could not be parsed");
  });

  it("fails with a planning schema_error after the bounded attempts are exhausted", async () => {
    const provider = new SequenceProvider([
      response({ status: "supported" }),
      response({ status: "supported", title: "Still invalid" }),
    ]);

    await expect(
      planFactorioPrompt({ provider, prompt: "Make steel furnaces twice as fast" }),
    ).rejects.toMatchObject({
      code: "schema_error",
      stage: "planning",
      retryable: false,
    } satisfies Partial<ProjectError>);
    expect(provider.requests).toHaveLength(2);
  });

  it("rejects empty and oversized prompts before calling a provider", async () => {
    const provider = new SequenceProvider([response(fasterSteelDraft())]);
    await expect(planFactorioPrompt({ provider, prompt: "   " })).rejects.toMatchObject({
      code: "input_error",
    });
    await expect(
      planFactorioPrompt({ provider, prompt: "123456", maxPromptChars: 5 }),
    ).rejects.toMatchObject({ code: "input_error" });
    expect(provider.requests).toHaveLength(0);
  });
});


describe("planFactorioRevision", () => {
  it("preserves unchanged tweaks and application-owned metadata while revising the full bundle", async () => {
    const provider = new SequenceProvider([
      response({
        status: "supported",
        changes: [
          {
            type: "prototype_property",
            prototypeType: "furnace",
            prototypeName: "steel-furnace",
            property: "crafting_speed",
            operation: { type: "multiply", factor: 1.875 },
          },
          {
            type: "technology_cost",
            technologyName: "automation",
            operation: { type: "multiply", factor: 0.5 },
          },
        ],
      }),
    ]);

    const result = await planFactorioRevision({
      provider,
      baseModSpec: acceptedSpec,
      prompt: "Keep everything else, but make steel furnaces another 25% faster",
    });

    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("expected supported revision");
    expect(result.modSpec.title).toBe(acceptedSpec.title);
    expect(result.modSpec.slug).toBe(acceptedSpec.slug);
    expect(result.modSpec.target).toEqual(acceptedSpec.target);
    expect(result.modSpec.capability).toBe("mixed");
    expect(result.modSpec.changes).toHaveLength(2);
    expect(result.modSpec.changes[0]).toMatchObject({
      type: "prototype_property",
      operation: { type: "multiply", factor: 1.875 },
    });
    expect(result.modSpec.changes[1]).toEqual(acceptedSpec.changes[1]);
    expect(provider.requests[0]?.schemaName).toBe("factorio_revision_decision");
    expect(provider.requests[0]?.messages[1]?.content).toContain('"slug": "fast-start"');
  });

  it("can remove a tweak by returning the complete remaining bundle", async () => {
    const provider = new SequenceProvider([
      response({
        status: "supported",
        changes: [acceptedSpec.changes[0]],
      }),
    ]);
    const result = await planFactorioRevision({
      provider,
      baseModSpec: acceptedSpec,
      prompt: "Restore Automation research cost to normal and keep the furnace tweak",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("expected supported revision");
    expect(result.modSpec.capability).toBe("prototype_property");
    expect(result.modSpec.changes).toEqual([acceptedSpec.changes[0]]);
  });

  it("revises a created machine while preserving the rest of its content definition", async () => {
    const current = newMachineSpec.changes[0];
    if (!current || current.type !== "new_machine") throw new Error("expected new machine fixture");
    const provider = new SequenceProvider([response({
      status: "supported",
      changes: [{ ...current, speed: 5 }],
    })]);
    const result = await planFactorioRevision({
      provider,
      baseModSpec: newMachineSpec,
      prompt: "Keep everything else but make the new furnace 25% faster",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") throw new Error("expected supported revision");
    expect(result.modSpec.capability).toBe("new_machine");
    expect(result.modSpec.changes[0]).toMatchObject({ type: "new_machine", speed: 5, energyUsageKw: 540 });
    expect(result.modSpec.assertions[0]).toMatchObject({ type: "new_machine_matches", speed: 5 });
  });

  it("rejects broad category follow-ups before calling the revision model", async () => {
    const provider = new SequenceProvider([]);
    const result = await planFactorioRevision({
      provider,
      baseModSpec: acceptedSpec,
      prompt: "Also make all inserters twice as fast",
    });
    expect(result).toMatchObject({ status: "unsupported" });
    expect(provider.requests).toHaveLength(0);
  });

  it("rejects broad Russian category follow-ups before calling the revision model", async () => {
    const provider = new SequenceProvider([]);
    const result = await planFactorioRevision({
      provider,
      baseModSpec: acceptedSpec,
      prompt: "Теперь ускорь все манипуляторы в 2 раза, остальное оставь",
    });
    expect(result).toMatchObject({ status: "unsupported" });
    if (result.status !== "unsupported") throw new Error("expected unsupported revision");
    expect(result.reason).toContain("манипуляторы");
    expect(provider.requests).toHaveLength(0);
  });

  it("publishes the complete-result and no-partial-application contract", () => {
    const prompt = buildRevisionSystemPrompt();
    expect(prompt).toContain("COMPLETE resulting typed change set");
    expect(prompt).toContain("Preserve unchanged tweaks exactly");
    expect(prompt).toContain("return unsupported rather than partially applying");
    expect(prompt).toContain("recipe_crafting_time");
    expect(prompt).toContain("recipe_result");
    expect(prompt).toContain("item_stack_size");
    expect(prompt).toContain("new_machine");
    expect(prompt).toContain("new_recipe");
    expect(prompt).toContain("new_item");
  });
});
