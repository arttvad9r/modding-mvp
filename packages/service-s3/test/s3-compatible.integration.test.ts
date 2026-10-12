import { describe, expect, it } from "vitest";

import { createS3ArtifactStore } from "../src/index.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required integration environment variable: ${name}`);
  return value;
}

describe("S3ArtifactStore against an S3-compatible server", () => {
  it("uploads a ZIP and downloads the exact bytes through a presigned URL", async () => {
    const endpoint = required("PROJECT_SERVICE_S3_ENDPOINT");
    const store = createS3ArtifactStore({
      endpoint,
      region: "us-east-1",
      bucket: required("PROJECT_SERVICE_S3_BUCKET"),
      forcePathStyle: true,
      credentials: {
        accessKeyId: required("PROJECT_SERVICE_S3_ACCESS_KEY"),
        secretAccessKey: required("PROJECT_SERVICE_S3_SECRET_KEY"),
      },
    });
    await expect(store.checkAccess()).resolves.toBeUndefined();
    const missingBucket = createS3ArtifactStore({
      endpoint,
      region: "us-east-1",
      bucket: "missing-readiness-bucket",
      forcePathStyle: true,
      credentials: {
        accessKeyId: required("PROJECT_SERVICE_S3_ACCESS_KEY"),
        secretAccessKey: required("PROJECT_SERVICE_S3_SECRET_KEY"),
      },
    });
    await expect(missingBucket.checkAccess()).rejects.toBeDefined();

    const bytes = new TextEncoder().encode("real s3-compatible integration artifact");
    const artifact = await store.put({
      key: "generations/88888888-8888-4888-8888-888888888888/s3-compatible_0.1.0.zip",
      fileName: "s3-compatible_0.1.0.zip",
      contentType: "application/zip",
      bytes,
    });

    expect(artifact.sizeBytes).toBe(bytes.byteLength);
    const downloadUrl = await store.createDownloadUrl(artifact, 60);
    const response = await fetch(downloadUrl);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});
