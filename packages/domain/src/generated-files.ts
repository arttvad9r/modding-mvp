import { z } from "zod";

const safePathSegment = /^[A-Za-z0-9._-]+$/;

export const GeneratedFileRoleSchema = z.enum([
  "metadata",
  "data_stage",
  "documentation",
]);

export const GeneratedTextFileSchema = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(240)
    .refine((value) => !value.startsWith("/"), "Generated path must be relative")
    .refine((value) => !value.includes("\\"), "Generated path must use POSIX separators")
    .refine(
      (value) =>
        value.split("/").every(
          (segment) =>
            segment.length > 0 &&
            segment !== "." &&
            segment !== ".." &&
            safePathSegment.test(segment),
        ),
      "Generated path contains an unsafe segment",
    ),
  content: z.string().max(1_000_000),
  role: GeneratedFileRoleSchema.optional(),
});

export const GeneratedFileManifestSchema = z
  .strictObject({
    files: z.array(GeneratedTextFileSchema).min(1).max(32),
  })
  .superRefine((manifest, ctx) => {
    const paths = new Set<string>();
    for (const [index, file] of manifest.files.entries()) {
      if (paths.has(file.path)) {
        ctx.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "Duplicate generated file path",
        });
      }
      paths.add(file.path);
    }
  });

export type GeneratedFileRole = z.infer<typeof GeneratedFileRoleSchema>;
export type GeneratedTextFile = z.infer<typeof GeneratedTextFileSchema>;
export type GeneratedFileManifest = z.infer<typeof GeneratedFileManifestSchema>;
