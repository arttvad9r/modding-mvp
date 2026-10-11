import { describe, expect, it } from "vitest";

import { smokeS3CompatibleProvider } from "../src/index.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing integration environment variable: ${name}`);
  return value;
}

describe("S3-compatible provider smoke", () => {
  it("uploads, presigned-downloads byte-for-byte, and removes the smoke object", async () => {
    const result = await smokeS3CompatibleProvider({
      endpoint: required("PROJECT_SERVICE_S3_ENDPOINT"),
      bucket: required("PROJECT_SERVICE_S3_BUCKET"),
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: required("PROJECT_SERVICE_S3_ACCESS_KEY"),
        secretAccessKey: required("PROJECT_SERVICE_S3_SECRET_KEY"),
      },
    });
    expect(result).toMatchObject({ ok: true, bytes: 8, cleanedUp: true });
    expect(result.key).toMatch(/^smoke\/[0-9a-f-]+\/provider-smoke_0\.1\.0\.zip$/);
  });
});
