import { HeadBucketCommand, type S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { S3ArtifactStore } from "../src/index.js";

class CapturingClient {
  readonly commands: unknown[] = [];
  readonly sendOptions: unknown[] = [];

  async send(command: unknown, options?: unknown): Promise<object> {
    this.commands.push(command);
    this.sendOptions.push(options);
    return {};
  }
}

describe("S3ArtifactStore", () => {
  it("uploads only safe ZIP artifact metadata and returns no public URL", async () => {
    const client = new CapturingClient();
    const store = new S3ArtifactStore(client as unknown as S3Client, {
      bucket: "modding-artifacts",
    });
    const bytes = new Uint8Array([1, 2, 3]);

    const artifact = await store.put({
      key: "generations/11111111-1111-4111-8111-111111111111/test-mod_0.1.0.zip",
      fileName: "test-mod_0.1.0.zip",
      contentType: "application/zip",
      bytes,
    });

    expect(artifact).toEqual({
      key: "generations/11111111-1111-4111-8111-111111111111/test-mod_0.1.0.zip",
      fileName: "test-mod_0.1.0.zip",
      contentType: "application/zip",
      sizeBytes: 3,
    });
    expect(client.commands).toHaveLength(1);
    const input = (client.commands[0] as { input: Record<string, unknown> }).input;
    expect(input).toMatchObject({
      Bucket: "modding-artifacts",
      Key: artifact.key,
      Body: bytes,
      ContentType: "application/zip",
      Metadata: { "artifact-file-name": artifact.fileName },
    });
    expect(artifact).not.toHaveProperty("url");
  });

  it("checks bucket access for readiness with the caller's abort signal", async () => {
    const client = new CapturingClient();
    const store = new S3ArtifactStore(client as unknown as S3Client, { bucket: "modding-artifacts" });
    const controller = new AbortController();

    await store.checkAccess(controller.signal);
    expect(client.commands[0]).toBeInstanceOf(HeadBucketCommand);
    expect((client.commands[0] as { input: Record<string, unknown> }).input).toEqual({ Bucket: "modding-artifacts" });
    expect(client.sendOptions[0]).toEqual({ abortSignal: controller.signal });
  });

  it("forwards the publication abort signal and deletes orphaned objects by validated key", async () => {
    const client = new CapturingClient();
    const store = new S3ArtifactStore(client as unknown as S3Client, { bucket: "modding-artifacts" });
    const controller = new AbortController();
    const key = "generations/11111111-1111-4111-8111-111111111111/test-mod_0.1.0.zip";

    await store.put({
      key,
      fileName: "test-mod_0.1.0.zip",
      contentType: "application/zip",
      bytes: new Uint8Array([1]),
      signal: controller.signal,
    });
    expect(client.sendOptions[0]).toEqual({ abortSignal: controller.signal });

    await store.delete(key);
    expect((client.commands[1] as { input: Record<string, unknown> }).input).toEqual({
      Bucket: "modding-artifacts",
      Key: key,
    });
    await expect(store.delete("../escape.zip")).rejects.toBeDefined();
    expect(client.commands).toHaveLength(2);
  });

  it("rejects unsafe keys, names, and empty bytes before contacting S3", async () => {
    const client = new CapturingClient();
    const store = new S3ArtifactStore(client as unknown as S3Client, {
      bucket: "modding-artifacts",
    });

    await expect(
      store.put({
        key: "../escape.zip",
        fileName: "escape_0.1.0.zip",
        contentType: "application/zip",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toBeDefined();
    await expect(
      store.put({
        key: "generations/id/escape.zip",
        fileName: "../../escape.zip",
        contentType: "application/zip",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toBeDefined();
    await expect(
      store.put({
        key: "generations/id/empty_0.1.0.zip",
        fileName: "empty_0.1.0.zip",
        contentType: "application/zip",
        bytes: new Uint8Array(),
      }),
    ).rejects.toBeDefined();

    expect(client.commands).toHaveLength(0);
  });
});
