import {
  ModChangeSchema,
  ModSpecSchema,
  ProjectError,
  type ModAssertion,
  type ModChange,
  type ModSpec,
} from "@project/domain";
import {
  assertSupportedPrototypeProperty,
  assertSupportedRecipeIngredient,
  assertSupportedRecipeCraftingTime,
  assertSupportedRecipeResult,
  assertSupportedItemStackSize,
  assertSupportedTechnologyCost,
  assertSupportedTechnologyPrerequisite,
  listFactorioCapabilities,
} from "@project/factorio-knowledge";
import {
  aggregateLlmUsage,
  type AggregatedLlmUsage,
  type LlmJsonResponse,
  type LlmMessage,
  type LlmProvider,
  type LlmUsage,
} from "@project/llm";
import { z } from "zod";

import { findBroadScopeIssue } from "./scope-guard.js";

const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const titleSchema = z.string().trim().min(1).max(120);
const slugSchema = z.string().min(1).max(80).regex(safeSlug);

export const SupportedPlannerDraftSchema = z
  .strictObject({
    status: z.literal("supported"),
    title: titleSchema,
    slug: slugSchema,
    changes: z.array(ModChangeSchema).min(1).max(32),
    capability: z
      .enum([
        "prototype_property",
        "recipe_ingredient",
        "recipe_crafting_time",
        "recipe_result",
        "item_stack_size",
        "technology_cost",
        "technology_prerequisite",
      ])
      .optional(),
  })
  .superRefine((draft, ctx) => {
    if (draft.capability === undefined) return;
    const types = new Set(draft.changes.map((change) => change.type));
    if (types.size !== 1 || !types.has(draft.capability)) {
      ctx.addIssue({
        code: "custom",
        path: ["capability"],
        message: "Legacy capability field must match the single change family",
      });
    }
  });

export const UnsupportedPlannerDraftSchema = z.strictObject({
  status: z.literal("unsupported"),
  reason: z.string().trim().min(1).max(600),
});

export const PlannerDraftSchema = z.union([
  SupportedPlannerDraftSchema,
  UnsupportedPlannerDraftSchema,
]);

export type PlannerDraft = z.infer<typeof PlannerDraftSchema>;

export interface PlannerAttemptMetadata {
  readonly attempt: number;
  readonly provider: string;
  readonly model: string;
  readonly usage?: LlmUsage;
  readonly durationMs?: number;
}

interface PlannerResultBase {
  readonly attempts: readonly PlannerAttemptMetadata[];
  readonly usage: AggregatedLlmUsage;
}

export interface PlannerSupportedResult extends PlannerResultBase {
  readonly status: "supported";
  readonly modSpec: ModSpec;
}

export interface PlannerUnsupportedResult extends PlannerResultBase {
  readonly status: "unsupported";
  readonly reason: string;
}

export type PlannerResult = PlannerSupportedResult | PlannerUnsupportedResult;

export interface PlanFactorioPromptOptions {
  readonly provider: LlmProvider;
  readonly prompt: string;
  readonly maxAttempts?: number;
  readonly maxPromptChars?: number;
}

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_MAX_PROMPT_CHARS = 4_000;
const PLANNER_SCHEMA_DESCRIPTION = `Return exactly one JSON object in one of these shapes:
1. Supported root: {"status":"supported","title":string,"slug":kebab-case string,"changes":[...]}
2. Unsupported root: {"status":"unsupported","reason":string}
A supported request may contain multiple changes from different capability families. Every change must use exactly one of these shapes:
- prototype_property: {"type":"prototype_property","prototypeType":string,"prototypeName":string,"property":string,"operation":{"type":"set","value":number}|{"type":"multiply","factor":number}}
- recipe_ingredient: {"type":"recipe_ingredient","recipeName":string,"ingredientType":"item","ingredientName":string,"operation":{"type":"set","value":number}|{"type":"multiply","factor":number}}
- recipe_crafting_time: {"type":"recipe_crafting_time","recipeName":string,"operation":{"type":"set","value":number}|{"type":"multiply","factor":number}}
- recipe_result: {"type":"recipe_result","recipeName":string,"resultType":"item","resultName":string,"operation":{"type":"set","value":number}|{"type":"multiply","factor":number}}
- item_stack_size: {"type":"item_stack_size","itemName":string,"operation":{"type":"set","value":number}|{"type":"multiply","factor":number}}
- technology_cost: {"type":"technology_cost","technologyName":string,"operation":{"type":"set","value":number}|{"type":"multiply","factor":number}}
- technology_prerequisite: {"type":"technology_prerequisite","technologyName":string,"prerequisiteName":string,"operation":{"type":"add"}|{"type":"remove"}}
Use identifiers exactly as listed in the capability registry. Preserve every supported change the user asks for. If any essential requested change is outside the registry, return unsupported rather than silently dropping it. Do not include capability, target, assertions, Lua, files, markdown, or additional keys.`;

function plannerRegistryContext(): string {
  return JSON.stringify(
    listFactorioCapabilities().map((capability) => ({
      id: capability.id,
      target: capability.target,
      operations: capability.operations,
      summary: capability.summary,
      constraints: capability.constraints,
      targets: capability.targets,
    })),
    null,
    2,
  );
}

export function buildPlannerSystemPrompt(): string {
  return [
    "You are a constrained Factorio mod planner.",
    "Classify the user's request as supported or unsupported using ONLY the capability registry below.",
    "A supported request may combine multiple capability families, but every requested change must use only listed targets and operations.",
    "Do not approximate, invent identifiers, broaden scope, write Lua, or propose files.",
    "If any essential part is outside the registry, return unsupported with a concise reason; never silently drop an unsupported part.",
    "For supported requests, return title, kebab-case slug, and all typed changes only.",
    "The application deterministically derives target metadata and semantic assertions.",
    "Capability registry:",
    plannerRegistryContext(),
    "Output contract:",
    PLANNER_SCHEMA_DESCRIPTION,
  ].join("\n\n");
}

function assertionForChange(change: ModChange): ModAssertion {
  switch (change.type) {
    case "prototype_property":
      return {
        type: "prototype_property_matches",
        prototypeType: change.prototypeType,
        prototypeName: change.prototypeName,
        property: change.property,
        expectation: change.operation,
      };
    case "recipe_ingredient":
      return {
        type: "recipe_ingredient_matches",
        recipeName: change.recipeName,
        ingredientType: change.ingredientType,
        ingredientName: change.ingredientName,
        expectation: change.operation,
      };
    case "recipe_crafting_time":
      return { type: "recipe_crafting_time_matches", recipeName: change.recipeName, expectation: change.operation };
    case "recipe_result":
      return { type: "recipe_result_matches", recipeName: change.recipeName, resultType: change.resultType, resultName: change.resultName, expectation: change.operation };
    case "item_stack_size":
      return { type: "item_stack_size_matches", itemName: change.itemName, expectation: change.operation };
    case "technology_cost":
      return {
        type: "technology_cost_matches",
        technologyName: change.technologyName,
        expectation: change.operation,
      };
    case "technology_prerequisite":
      return {
        type: "technology_prerequisite_matches",
        technologyName: change.technologyName,
        prerequisiteName: change.prerequisiteName,
        expectation: change.operation,
      };
  }
}

function deriveModSpec(draft: z.infer<typeof SupportedPlannerDraftSchema>): ModSpec {
  const target = { game: "factorio", channel: "stable", versionLine: "2.0" } as const;
  const capabilityTypes = [...new Set(draft.changes.map((change) => change.type))];
  const capability = capabilityTypes.length === 1 ? capabilityTypes[0]! : "mixed";
  return ModSpecSchema.parse({
    title: draft.title,
    slug: draft.slug,
    target,
    capability,
    changes: draft.changes,
    assertions: draft.changes.map(assertionForChange),
  });
}

function assertModSpecSupported(spec: ModSpec): void {
  for (const change of spec.changes) {
    switch (change.type) {
      case "prototype_property":
        assertSupportedPrototypeProperty(change);
        break;
      case "recipe_ingredient":
        assertSupportedRecipeIngredient(change);
        break;
      case "recipe_crafting_time":
        assertSupportedRecipeCraftingTime(change);
        break;
      case "recipe_result":
        assertSupportedRecipeResult(change);
        break;
      case "item_stack_size":
        assertSupportedItemStackSize(change);
        break;
      case "technology_cost":
        assertSupportedTechnologyCost(change);
        break;
      case "technology_prerequisite":
        assertSupportedTechnologyPrerequisite(change);
        break;
    }
  }
}


function compactValidationError(error: unknown): string {
  if (error instanceof ProjectError) return `${error.code}: ${error.message}`;
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.map(String).join(".") || "root"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function validatePlannerResponse(value: unknown): PlannerDraft {
  return PlannerDraftSchema.parse(value);
}

function responseMetadata(response: LlmJsonResponse, attempt: number): PlannerAttemptMetadata {
  return {
    attempt,
    provider: response.provider,
    model: response.model,
    ...(response.usage === undefined ? {} : { usage: response.usage }),
    ...(response.durationMs === undefined ? {} : { durationMs: response.durationMs }),
  };
}

export async function planFactorioPrompt(
  options: PlanFactorioPromptOptions,
): Promise<PlannerResult> {
  const prompt = options.prompt.trim();
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxPromptChars = options.maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS;

  if (prompt.length === 0) {
    throw new ProjectError({ code: "input_error", stage: "input", message: "Prompt must not be empty" });
  }
  if (prompt.length > maxPromptChars) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: `Prompt exceeds ${maxPromptChars} characters`,
      details: { maxPromptChars, actualChars: prompt.length },
    });
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new ProjectError({
      code: "input_error",
      stage: "input",
      message: "Planner maxAttempts must be an integer in range 1..3",
    });
  }

  const preflightScopeIssue = findBroadScopeIssue(prompt);
  if (preflightScopeIssue !== null) {
    return {
      status: "unsupported",
      reason: preflightScopeIssue.reason,
      attempts: [],
      usage: aggregateLlmUsage([]),
    };
  }

  const messages: LlmMessage[] = [
    { role: "system", content: buildPlannerSystemPrompt() },
    { role: "user", content: prompt },
  ];
  const attempts: PlannerAttemptMetadata[] = [];
  let lastIssue = "Planner returned no valid decision";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: LlmJsonResponse;
    try {
      response = await options.provider.generateJson({
        messages,
        schemaName: "factorio_planner_decision",
        schemaDescription: PLANNER_SCHEMA_DESCRIPTION,
        maxOutputTokens: 2_500,
      });
    } catch (error) {
      if (
        error instanceof ProjectError &&
        error.code === "schema_error" &&
        error.retryable &&
        attempt < maxAttempts
      ) {
        lastIssue = `${error.code}: ${error.message}`;
        messages.push({
          role: "user",
          content: [
            "The previous provider response could not be parsed as the required JSON decision.",
            `Validation issue: ${lastIssue}`,
            "Return a corrected JSON decision only.",
          ].join("\n"),
        });
        continue;
      }
      if (error instanceof ProjectError) throw error;
      throw new ProjectError({
        code: "process_error",
        stage: "planning",
        message: `LLM provider call failed: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
        cause: error,
      });
    }

    attempts.push(responseMetadata(response, attempt));

    try {
      const draft = validatePlannerResponse(response.value);
      if (draft.status === "unsupported") {
        return {
          status: "unsupported",
          reason: draft.reason,
          attempts,
          usage: aggregateLlmUsage(attempts.map((entry) => entry.usage)),
        };
      }

      const modSpec = deriveModSpec(draft);
      assertModSpecSupported(modSpec);
      const broadScopeIssue = findBroadScopeIssue(prompt, modSpec.changes);
      if (broadScopeIssue !== null) {
        return {
          status: "unsupported",
          reason: broadScopeIssue.reason,
          attempts,
          usage: aggregateLlmUsage(attempts.map((entry) => entry.usage)),
        };
      }
      return {
        status: "supported",
        modSpec,
        attempts,
        usage: aggregateLlmUsage(attempts.map((entry) => entry.usage)),
      };
    } catch (error) {
      lastIssue = compactValidationError(error);
      if (attempt < maxAttempts) {
        messages.push({
          role: "user",
          content: [
            "Your previous structured response was rejected by the application.",
            `Validation issue: ${lastIssue}`,
            "Return a corrected JSON decision. Use only registry targets/operations and do not add extra fields.",
          ].join("\n"),
        });
      }
    }
  }

  throw new ProjectError({
    code: "schema_error",
    stage: "planning",
    message: `Planner failed to produce a valid decision after ${maxAttempts} attempt(s)`,
    details: { maxAttempts, lastIssue },
  });
}
