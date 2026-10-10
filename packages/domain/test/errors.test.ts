import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  ProjectError,
  normalizeProjectError,
  serializeProjectError,
} from "../src/index.js";

describe("ProjectError", () => {
  it("serializes stable public error fields without stack/cause", () => {
    const error = new ProjectError({
      code: "unsupported_capability",
      stage: "generation",
      message: "Unsupported target",
      details: { capability: "prototype_property" },
      cause: new Error("internal cause"),
    });

    expect(error.toJSON()).toEqual({
      code: "unsupported_capability",
      stage: "generation",
      message: "Unsupported target",
      retryable: false,
      details: { capability: "prototype_property" },
    });
  });

  it("normalizes Zod failures to schema_error", () => {
    const schema = z.object({ count: z.number().int().positive() });
    const result = schema.safeParse({ count: 0 });
    if (result.success) throw new Error("Expected schema failure");

    const error = normalizeProjectError(result.error, {
      code: "generation_error",
      stage: "generation",
    });

    expect(error.code).toBe("schema_error");
    expect(error.stage).toBe("input");
    expect(error.details?.issues).toBeInstanceOf(Array);
  });

  it("preserves an existing ProjectError instead of reclassifying it", () => {
    const original = new ProjectError({
      code: "packaging_error",
      stage: "packaging",
      message: "Bad manifest",
    });

    expect(
      normalizeProjectError(original, {
        code: "internal_error",
        stage: "internal",
      }),
    ).toBe(original);
  });

  it("provides a stable internal fallback for unknown exceptions", () => {
    expect(serializeProjectError(new Error("boom"))).toEqual({
      code: "internal_error",
      stage: "internal",
      message: "Unexpected internal error: boom",
      retryable: false,
    });
  });
});
