import { ProjectError } from "@project/domain";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { createFactorioZip, validateFactorioManifest } from "../src/index.js";

const validManifest = {
  files: [
    { path: "info.json", content: "{}\n", role: "metadata" as const },
    { path: "data.lua", content: "return\n", role: "data_stage" as const },
  ],
};

describe("Factorio artifact manifest", () => {
  it("accepts exactly the M1 user artifact files", () => {
    expect(validateFactorioManifest(validManifest)).toEqual(validManifest);
  });

  it("rejects unexpected files even when the path is otherwise safe", () => {
    const run = () =>
      validateFactorioManifest({
        files: [
          ...validManifest.files,
          { path: "control.lua", content: "", role: "data_stage" },
        ],
      });
    expect(run).toThrow("Unsupported Factorio artifact file: control.lua");
    try {
      run();
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectError);
      expect((error as ProjectError).code).toBe("packaging_error");
      expect((error as ProjectError).stage).toBe("packaging");
    }
  });

  it("rejects missing files and role mismatches", () => {
    expect(() =>
      validateFactorioManifest({ files: [validManifest.files[0]!] }),
    ).toThrow("Missing required Factorio artifact file: data.lua");

    expect(() =>
      validateFactorioManifest({
        files: [
          { ...validManifest.files[0]!, role: "data_stage" },
          validManifest.files[1]!,
        ],
      }),
    ).toThrow("Unexpected role for info.json");
  });

  it("packages only the installable mod under the required top-level folder", () => {
    const bytes = createFactorioZip(validManifest, "example-mod_0.1.0");
    const files = unzipSync(bytes);

    expect(Object.keys(files).sort()).toEqual([
      "example-mod_0.1.0/data.lua",
      "example-mod_0.1.0/info.json",
    ]);
    expect(strFromU8(files["example-mod_0.1.0/info.json"]!)).toBe("{}\n");
    expect(Object.keys(files).some((name) => name.includes("validator"))).toBe(false);
    expect(Object.keys(files).some((name) => name.endsWith("data-final-fixes.lua"))).toBe(
      false,
    );
  });
});
