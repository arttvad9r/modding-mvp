import { ZodError } from "zod";

export type ProjectErrorCode =
  | "input_error"
  | "schema_error"
  | "unsupported_capability"
  | "generation_error"
  | "packaging_error"
  | "factorio_load_failed"
  | "semantic_assertion_failed"
  | "process_error"
  | "internal_error";

export type ProjectErrorStage =
  | "input"
  | "planning"
  | "generation"
  | "packaging"
  | "validation"
  | "process"
  | "internal";

export interface ProjectErrorDetails {
  readonly [key: string]: unknown;
}

export interface ProjectErrorInit {
  readonly code: ProjectErrorCode;
  readonly stage: ProjectErrorStage;
  readonly message: string;
  readonly retryable?: boolean;
  readonly details?: ProjectErrorDetails;
  readonly cause?: unknown;
}

export interface SerializedProjectError {
  readonly code: ProjectErrorCode;
  readonly stage: ProjectErrorStage;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: ProjectErrorDetails;
}

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  readonly stage: ProjectErrorStage;
  readonly retryable: boolean;
  readonly details?: ProjectErrorDetails;

  constructor(init: ProjectErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "ProjectError";
    this.code = init.code;
    this.stage = init.stage;
    this.retryable = init.retryable ?? false;
    if (init.details !== undefined) this.details = init.details;
  }

  toJSON(): SerializedProjectError {
    return {
      code: this.code,
      stage: this.stage,
      message: this.message,
      retryable: this.retryable,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export interface NormalizeProjectErrorFallback {
  readonly code: ProjectErrorCode;
  readonly stage: ProjectErrorStage;
  readonly message?: string;
  readonly retryable?: boolean;
}

export function normalizeProjectError(
  error: unknown,
  fallback: NormalizeProjectErrorFallback,
): ProjectError {
  if (error instanceof ProjectError) return error;

  if (error instanceof ZodError) {
    return new ProjectError({
      code: "schema_error",
      stage: "input",
      message: "Input failed schema validation",
      details: {
        issues: error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          code: issue.code,
          message: issue.message,
        })),
      },
      cause: error,
    });
  }

  const originalMessage = error instanceof Error ? error.message : String(error);
  const message = fallback.message
    ? `${fallback.message}: ${originalMessage}`
    : originalMessage;

  return new ProjectError({
    code: fallback.code,
    stage: fallback.stage,
    message,
    retryable: fallback.retryable ?? false,
    cause: error,
  });
}

export function serializeProjectError(
  error: unknown,
  fallback: NormalizeProjectErrorFallback = {
    code: "internal_error",
    stage: "internal",
    message: "Unexpected internal error",
  },
): SerializedProjectError {
  return normalizeProjectError(error, fallback).toJSON();
}
