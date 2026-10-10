import {
  ModSpecSchema,
  ProjectError,
  PrototypePropertyChangeSchema,
  RecipeIngredientChangeSchema,
  TechnologyCostChangeSchema,
  TechnologyPrerequisiteChangeSchema,
  type ModSpec,
} from "@project/domain";
import {
  assertSupportedPrototypeProperty,
  assertSupportedRecipeIngredient,
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

const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const titleSchema = z.string().trim().min(1).max(120);
const slugSchema = z.string().min(1).max(80).regex(safeSlug);

const PrototypePlannerDraftSchema = z.strictObject({
  status: z.literal("supported"),
  title: titleSchema,
  slug: slugSchema,
  capability: z.literal("prototype_property"),
  changes: z.array(PrototypePropertyChangeSchema).min(1).max(16),
});

const RecipePlannerDraftSchema = z.strictObject({
  status: z.literal("supported"),
  title: titleSchema,
  slug: slugSchema,
  capability: z.literal("recipe_ingredient"),
  changes: z.array(RecipeIngredientChangeSchema).min(1).max(16),
});

const TechnologyCostPlannerDraftSchema = z.strictObject({
  status: z.literal("supported"),
  title: titleSchema,
  slug: slugSchema,
  capability: z.literal("technology_cost"),
  changes: z.array(TechnologyCostChangeSchema).min(1).max(16),
});

const TechnologyPrerequisitePlannerDraftSchema = z.strictObject({
  status: z.literal("supported"),
  title: titleSchema,
  slug: slugSchema,
  capability: z.literal("technology_prerequisite"),
  changes: z.array(TechnologyPrerequisiteChangeSchema).min(1).max(16),
});

export const SupportedPlannerDraftSchema = z.discriminatedUnion("capability", [
  PrototypePlannerDraftSchema,
  RecipePlannerDraftSchema,
  TechnologyCostPlannerDraftSchema,
  TechnologyPrerequisitePlannerDraftSchema,
]);

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
1. Supported: {"status":"supported","title":string,"slug":kebab-case string,"capability":one registry capability id,"changes":[typed changes for that capability]}
2. Unsupported: {"status":"unsupported","reason":string}
Do not include target, assertions, Lua, files, markdown, or additional keys.`;

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
    "A supported request must be representable exactly by one capability family and only listed targets/operations.",
    "Do not approximate, invent identifiers, broaden scope, write Lua, or propose files.",
    "If any essential part is outside the registry, return unsupported with a concise reason.",
    "For supported requests, return title, kebab-case slug, capability, and typed changes only.",
    "The application deterministically derives target metadata and semantic assertions.",
    "Capability registry:",
    plannerRegistryContext(),
    "Output contract:",
    PLANNER_SCHEMA_DESCRIPTION,
  ].join("\n\n");
}

function deriveModSpec(draft: z.infer<typeof SupportedPlannerDraftSchema>): ModSpec {
  const target = { game: "factorio", channel: "stable", versionLine: "2.0" } as const;

  switch (draft.capability) {
    case "prototype_property":
      return ModSpecSchema.parse({
        title: draft.title,
        slug: draft.slug,
        target,
        capability: draft.capability,
        changes: draft.changes,
        assertions: draft.changes.map((change) => ({
          type: "prototype_property_matches" as const,
          prototypeType: change.prototypeType,
          prototypeName: change.prototypeName,
          property: change.property,
          expectation: change.operation,
        })),
      });
    case "recipe_ingredient":
      return ModSpecSchema.parse({
        title: draft.title,
        slug: draft.slug,
        target,
        capability: draft.capability,
        changes: draft.changes,
        assertions: draft.changes.map((change) => ({
          type: "recipe_ingredient_matches" as const,
          recipeName: change.recipeName,
          ingredientType: change.ingredientType,
          ingredientName: change.ingredientName,
          expectation: change.operation,
        })),
      });
    case "technology_cost":
      return ModSpecSchema.parse({
        title: draft.title,
        slug: draft.slug,
        target,
        capability: draft.capability,
        changes: draft.changes,
        assertions: draft.changes.map((change) => ({
          type: "technology_cost_matches" as const,
          technologyName: change.technologyName,
          expectation: change.operation,
        })),
      });
    case "technology_prerequisite":
      return ModSpecSchema.parse({
        title: draft.title,
        slug: draft.slug,
        target,
        capability: draft.capability,
        changes: draft.changes,
        assertions: draft.changes.map((change) => ({
          type: "technology_prerequisite_matches" as const,
          technologyName: change.technologyName,
          prerequisiteName: change.prerequisiteName,
          expectation: change.operation,
        })),
      });
  }
}

function assertModSpecSupported(spec: ModSpec): void {
  switch (spec.capability) {
    case "prototype_property":
      for (const change of spec.changes) assertSupportedPrototypeProperty(change);
      return;
    case "recipe_ingredient":
      for (const change of spec.changes) assertSupportedRecipeIngredient(change);
      return;
    case "technology_cost":
      for (const change of spec.changes) assertSupportedTechnologyCost(change);
      return;
    case "technology_prerequisite":
      for (const change of spec.changes) assertSupportedTechnologyPrerequisite(change);
      return;
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
        maxOutputTokens: 1_500,
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
