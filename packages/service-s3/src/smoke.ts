import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

import { S3ArtifactStore } from "./artifact-store.js";

export interface S3ProviderSmokeOptions extends Omit<S3ClientConfig, "region"> {
  readonly bucket: string;
  readonly region: string;
  readonly fetchImpl?: typeof fetch;
}

export interface S3ProviderSmokeResult {
  readonly ok: true;
  readonly key: string;
  readonly bytes: number;
  readonly cleanedUp: true;
}

export async function smokeS3CompatibleProvider(
  options: S3ProviderSmokeOptions,
): Promise<S3ProviderSmokeResult> {
  const { bucket, fetchImpl = fetch, ...clientConfig } = options;
  const client = new S3Client(clientConfig);
  const store = new S3ArtifactStore(client, { bucket, defaultDownloadExpirySeconds: 60 });
  const id = randomUUID();
  const key = `smoke/${id}/provider-smoke_0.1.0.zip`;
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x4d, 0x36, 0x53, 0x33]);

  let uploaded = false;
  try {
    const artifact = await store.put({
      key,
      fileName: "provider-smoke_0.1.0.zip",
      contentType: "application/zip",
      bytes,
    });
    uploaded = true;
    const downloadUrl = await store.createDownloadUrl(artifact, 60);
    const response = await fetchImpl(downloadUrl);
    if (!response.ok) {
      throw new Error(`Presigned storage smoke download failed with HTTP ${response.status}`);
    }
    const downloaded = new Uint8Array(await response.arrayBuffer());
    if (downloaded.byteLength !== bytes.byteLength) {
      throw new Error(`Storage smoke byte length mismatch: ${downloaded.byteLength} != ${bytes.byteLength}`);
    }
    for (let index = 0; index < bytes.length; index += 1) {
      if (downloaded[index] !== bytes[index]) {
        throw new Error(`Storage smoke byte mismatch at offset ${index}`);
      }
    }
    return { ok: true, key, bytes: bytes.byteLength, cleanedUp: true };
  } finally {
    if (uploaded) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
    client.destroy();
  }
}
