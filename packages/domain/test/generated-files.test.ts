import { describe, expect, it } from "vitest";

import { GeneratedFileManifestSchema } from "../src/index.js";

describe("GeneratedFileManifestSchema", () => {
  it("accepts bounded relative POSIX paths", () => {
    const manifest = {
      files: [
        { path: "info.json", content: "{}\n", role: "metadata" },
        { path: "locale/en/mod.cfg", content: "[mod-name]\n", role: "documentation" },
      ],
    };

    expect(GeneratedFileManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it.each([
    "/absolute/data.lua",
    "../data.lua",
    "nested/../data.lua",
    "nested\\data.lua",
    "nested//data.lua",
  ])("rejects unsafe path %s", (unsafePath) => {
    expect(
      GeneratedFileManifestSchema.safeParse({
        files: [{ path: unsafePath, content: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate paths", () => {
    expect(
      GeneratedFileManifestSchema.safeParse({
        files: [
          { path: "data.lua", content: "first" },
          { path: "data.lua", content: "second" },
        ],
      }).success,
    ).toBe(false);
  });
});
