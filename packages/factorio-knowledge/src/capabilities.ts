import type { ModSpec } from "@project/domain";

import {
  listSupportedPrototypeProperties,
  listSupportedRecipeIngredients,
  listSupportedRecipeCraftingTimes,
  listSupportedRecipeResults,
  listSupportedItemStackSizes,
  listSupportedTechnologyCosts,
  listSupportedTechnologyPrerequisites,
  listSupportedNewMachineTemplates,
  listSupportedNewMachineRecipeItems,
  listSupportedNewMachineTechnologies,
  listSupportedNewRecipeItems,
  listSupportedNewItemTemplates,
} from "./supported.js";

export type FactorioCapabilityId = Exclude<ModSpec["capability"], "mixed">;
export type FactorioCapabilityOperation = "set" | "multiply" | "add" | "remove" | "create";

export interface FactorioCapabilityTargetPolicy {
  readonly game: "factorio";
  readonly channel: "stable";
  readonly versionLine: "2.0";
  readonly validatedRuntime: "2.0.77";
}

export type FactorioCapabilityTarget =
  | {
      readonly kind: "prototype_property";
      readonly prototypeType: string;
      readonly prototypeName: string;
      readonly property: string;
      readonly baseValue: number;
    }
  | {
      readonly kind: "recipe_ingredient";
      readonly recipeName: string;
      readonly ingredientType: "item";
      readonly ingredientName: string;
      readonly baseAmount: number;
    }
  | {
      readonly kind: "recipe_crafting_time";
      readonly recipeName: string;
      readonly baseEnergyRequired: number;
    }
  | {
      readonly kind: "recipe_result";
      readonly recipeName: string;
      readonly resultType: "item";
      readonly resultName: string;
      readonly baseAmount: number;
    }
  | {
      readonly kind: "item_stack_size";
      readonly itemName: string;
      readonly baseStackSize: number;
    }
  | {
      readonly kind: "technology_cost";
      readonly technologyName: string;
      readonly baseCount: number;
    }
  | {
      readonly kind: "technology_prerequisite";
      readonly technologyName: string;
      readonly prerequisiteName: string;
      readonly basePresent: boolean;
      readonly allowedOperation: "add" | "remove";
    }
  | {
      readonly kind: "new_machine_template";
      readonly machineType: "assembling-machine" | "furnace" | "mining-drill" | "lab";
      readonly basePrototypeName: "assembling-machine-2" | "assembling-machine-3" | "electric-furnace" | "electric-mining-drill" | "lab" | "chemical-plant" | "oil-refinery" | "centrifuge";
      readonly baseItemName: string;
      readonly speedProperty: "crafting_speed" | "mining_speed" | "researching_speed";
      readonly baseSpeed: number;
      readonly baseEnergyUsageKw: number;
      readonly baseModuleSlots: number;
    }
  | {
      readonly kind: "new_recipe_item";
      readonly itemName: string;
    }
  | {
      readonly kind: "new_item_template";
      readonly itemName: string;
    };

export interface FactorioCapabilityDescriptor {
  readonly id: FactorioCapabilityId;
  readonly changeType: FactorioCapabilityId;
  readonly target: FactorioCapabilityTargetPolicy;
  readonly operations: readonly FactorioCapabilityOperation[];
  readonly summary: string;
  readonly constraints: readonly string[];
  readonly promptExamples: readonly string[];
  readonly targets: readonly FactorioCapabilityTarget[];
}

const target: FactorioCapabilityTargetPolicy = {
  game: "factorio",
  channel: "stable",
  versionLine: "2.0",
  validatedRuntime: "2.0.77",
};

export const factorioCapabilityRegistry = {
  prototype_property: {
    id: "prototype_property",
    changeType: "prototype_property",
    target,
    operations: ["set", "multiply"],
    summary: "Change an allow-listed numeric property on an existing base-game prototype.",
    constraints: [
      "Only explicitly allow-listed prototype/property addresses are supported.",
      "Reviewed numeric speed properties are supported on furnaces, assembling machines, mining drills, transport belts, inserters, and labs.",
      "Relative operations use a pinned Factorio 2.0.77 baseline.",
    ],
    promptExamples: [
      "Make steel furnaces twice as fast.",
      "Make assembling machine 2 twice as fast.",
      "Increase basic transport belt speed by 50%.",
      "Double electric mining drill speed.",
    ],
    targets: listSupportedPrototypeProperties().map((entry) => ({
      kind: "prototype_property" as const,
      ...entry,
    })),
  },
  recipe_ingredient: {
    id: "recipe_ingredient",
    changeType: "recipe_ingredient",
    target,
    operations: ["set", "multiply"],
    summary: "Change the amount of an existing allow-listed item ingredient in a base-game recipe.",
    constraints: [
      "Only existing item ingredients are supported.",
      "Adding/removing ingredients, fluids, and product changes are unsupported.",
      "The final amount must be an integer in 1..65535.",
    ],
    promptExamples: [
      "Make iron gears cost one iron plate.",
      "Double the copper cable cost of electronic circuits.",
    ],
    targets: listSupportedRecipeIngredients().map((entry) => ({
      kind: "recipe_ingredient" as const,
      ...entry,
    })),
  },
  recipe_crafting_time: {
    id: "recipe_crafting_time", changeType: "recipe_crafting_time", target, operations: ["set", "multiply"],
    summary: "Change crafting time (energy_required) for an allow-listed base-game recipe.",
    constraints: ["Only reviewed recipes are supported.", "Final crafting time must stay positive and finite.", "Relative operations use the pinned 2.0.77 baseline."],
    promptExamples: ["Make iron gears craft twice as fast.", "Set transport belt crafting time to 0.25 seconds."],
    targets: listSupportedRecipeCraftingTimes().map((entry) => ({ kind: "recipe_crafting_time" as const, ...entry })),
  },
  recipe_result: {
    id: "recipe_result", changeType: "recipe_result", target, operations: ["set", "multiply"],
    summary: "Change the amount of an existing allow-listed item result in a base-game recipe.",
    constraints: ["Only existing reviewed item results are supported.", "Adding/removing results and fluid results are unsupported.", "Final amount must be an integer in 1..65535."],
    promptExamples: ["Make iron gear recipes produce 2 gears.", "Double transport belt recipe output."],
    targets: listSupportedRecipeResults().map((entry) => ({ kind: "recipe_result" as const, ...entry })),
  },
  item_stack_size: {
    id: "item_stack_size", changeType: "item_stack_size", target, operations: ["set", "multiply"],
    summary: "Change stack_size for an allow-listed base-game item.",
    constraints: ["Only reviewed base-game item prototypes are supported.", "Final stack size must be an integer in 1..65535."],
    promptExamples: ["Double iron plate stack size.", "Set electronic circuit stack size to 500."],
    targets: listSupportedItemStackSizes().map((entry) => ({ kind: "item_stack_size" as const, ...entry })),
  },
  technology_cost: {
    id: "technology_cost",
    changeType: "technology_cost",
    target,
    operations: ["set", "multiply"],
    summary: "Change finite research unit.count for an allow-listed base-game technology.",
    constraints: [
      "Only technologies with numeric unit.count are supported.",
      "Technologies using count_formula are unsupported.",
      "The final research count must be a positive safe integer.",
    ],
    promptExamples: [
      "Double the research cost of Automation.",
      "Set Logistics research cost to 40 science packs.",
    ],
    targets: listSupportedTechnologyCosts().map((entry) => ({
      kind: "technology_cost" as const,
      ...entry,
    })),
  },
  new_machine: {
    id: "new_machine",
    changeType: "new_machine",
    target,
    operations: ["create"],
    summary: "Create a new placeable production/research machine by cloning a reviewed base-game prototype, with its own item, recipe, and technology unlock.",
    constraints: [
      "The internal name must start with custom- to avoid collisions with base-game prototypes.",
      "Graphics and icons are inherited from the reviewed base prototype; generated/custom assets are not used.",
      "Supported base templates are listed in targets with the exact speed property plus pinned speed, energy-usage, and module-slot baselines.",
      `Allowed recipe ingredient item names: ${listSupportedNewMachineRecipeItems().join(", ")}.`,
      `Allowed existing unlock/prerequisite technologies: ${listSupportedNewMachineTechnologies().join(", ")}.`,
      "Unlock may use one existing reviewed technology or create one new technology derived from the machine name.",
      "New technology scienceTier is one of automation, logistic, chemical, production, utility.",
      "Recipe output is exactly one copy of the new machine item.",
    ],
    promptExamples: [
      "Add a custom advanced electric furnace based on the electric furnace, twice as fast, using 540 kW, crafted from steel plates, advanced circuits and stone bricks, unlocked by Advanced material processing 2.",
      "Create a custom assembler based on assembling machine 3 with speed 2.5 and a new research after Automation 2.",
    ],
    targets: listSupportedNewMachineTemplates().map((entry) => ({
      kind: "new_machine_template" as const,
      ...entry,
    })),
  },
  new_recipe: {
    id: "new_recipe",
    changeType: "new_recipe",
    target,
    operations: ["create"],
    summary: "Create a new alternative crafting recipe for one reviewed existing base-game item, with an existing or new technology unlock.",
    constraints: [
      "The internal recipe name must start with custom-.",
      `Allowed ingredient/result item names: ${listSupportedNewRecipeItems().join(", ")}.`,
      `Allowed existing unlock/prerequisite technologies: ${listSupportedNewMachineTechnologies().join(", ")}.`,
      "The recipe has one reviewed item result and item-only ingredients; fluids and new result item prototypes are outside this capability.",
      "Unlock may use one existing reviewed technology or create one new technology derived from the recipe name.",
      "New technology scienceTier is one of automation, logistic, chemical, production, utility.",
    ],
    promptExamples: [
      "Create an alternative Steel Gears recipe: 1 steel plate makes 5 iron gears in 1 second, unlocked by Steel processing.",
      "Add a Precision Circuits recipe using copper plates and advanced circuits, unlocked by a new chemical-science technology.",
    ],
    targets: listSupportedNewRecipeItems().map((itemName) => ({ kind: "new_recipe_item" as const, itemName })),
  },
  new_item: {
    id: "new_item",
    changeType: "new_item",
    target,
    operations: ["create"],
    summary: "Create a new intermediate item by cloning the icon/order of a reviewed base-game item, with its own recipe and technology unlock.",
    constraints: [
      "The internal item name must start with custom-.",
      "The item icon/subgroup/order are inherited from one reviewed non-placeable base-game item template; generated/custom graphics are not used.",
      `Allowed base recipe ingredient names: ${listSupportedNewMachineRecipeItems().join(", ")}.`,
      `Allowed existing unlock/prerequisite technologies: ${listSupportedNewMachineTechnologies().join(", ")}.`,
      "The new item may be referenced by new_machine/new_recipe changes in the same request; a new_item recipe itself currently uses reviewed base-game ingredients only.",
      "Unlock may use one existing reviewed technology or create one new technology derived from the item name.",
    ],
    promptExamples: [
      "Create a new intermediate item called Reinforced Plate based on the steel plate icon: 2 steel plates and 5 plastic bars make 1 Reinforced Plate, unlocked by Advanced material processing 2.",
    ],
    targets: listSupportedNewItemTemplates().map((itemName) => ({ kind: "new_item_template" as const, itemName })),
  },
  technology_prerequisite: {
    id: "technology_prerequisite",
    changeType: "technology_prerequisite",
    target,
    operations: ["add", "remove"],
    summary: "Add or remove one reviewed prerequisite edge between base-game technologies.",
    constraints: [
      "Only reviewed technology/prerequisite pairs are supported.",
      "Each pair permits exactly one pre-reviewed operation: add or remove.",
      "Arbitrary research-graph edits are unsupported to avoid unreviewed cycles.",
    ],
    promptExamples: [
      "Remove Steel processing as a prerequisite for Automation 2.",
      "Make Logistics a prerequisite for Automation 2.",
    ],
    targets: listSupportedTechnologyPrerequisites().map((entry) => ({
      kind: "technology_prerequisite" as const,
      ...entry,
    })),
  },
} satisfies Record<FactorioCapabilityId, FactorioCapabilityDescriptor>;

export function listFactorioCapabilities(): readonly FactorioCapabilityDescriptor[] {
  return Object.values(factorioCapabilityRegistry);
}

export function getFactorioCapability(
  id: FactorioCapabilityId,
): FactorioCapabilityDescriptor {
  return factorioCapabilityRegistry[id];
}
