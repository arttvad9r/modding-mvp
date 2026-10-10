import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ArtifactFileNameSchema,
  ArtifactKeySchema,
  ArtifactRefSchema,
  type ArtifactRef,
  type ArtifactStore,
  type ArtifactStorePutInput,
} from "@project/service-core";
import { z } from "zod";

const BucketSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/);
const DownloadExpirySchema = z.number().int().min(30).max(900);

export interface S3ArtifactStoreOptions {
  readonly client: S3Client;
  readonly bucket: string;
  readonly defaultDownloadExpirySeconds?: number;
}

export interface CreateS3ArtifactStoreOptions extends Omit<S3ClientConfig, "region"> {
  readonly bucket: string;
  readonly region: string;
  readonly defaultDownloadExpirySeconds?: number;
}

export class S3ArtifactStore implements ArtifactStore {
  readonly bucket: string;
  readonly defaultDownloadExpirySeconds: number;

  constructor(
    private readonly client: S3Client,
    options: Omit<S3ArtifactStoreOptions, "client">,
  ) {
    this.bucket = BucketSchema.parse(options.bucket);
    this.defaultDownloadExpirySeconds = DownloadExpirySchema.parse(
      options.defaultDownloadExpirySeconds ?? 300,
    );
  }

  async put(input: ArtifactStorePutInput): Promise<ArtifactRef> {
    const key = ArtifactKeySchema.parse(input.key);
    const fileName = ArtifactFileNameSchema.parse(input.fileName);
    if (input.contentType !== "application/zip") throw new Error("Artifact content type must be application/zip");
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1) {
      throw new Error("Artifact bytes must be a non-empty Uint8Array");
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.bytes,
        ContentType: "application/zip",
        Metadata: { "artifact-file-name": fileName },
      }),
    );

    return ArtifactRefSchema.parse({
      key,
      fileName,
      contentType: "application/zip",
      sizeBytes: input.bytes.byteLength,
    });
  }

  async createDownloadUrl(
    artifactInput: ArtifactRef,
    expiresInSeconds = this.defaultDownloadExpirySeconds,
  ): Promise<string> {
    const artifact = ArtifactRefSchema.parse(artifactInput);
    const expiresIn = DownloadExpirySchema.parse(expiresInSeconds);
    return await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: artifact.key,
        ResponseContentType: artifact.contentType,
        ResponseContentDisposition: `attachment; filename="${artifact.fileName}"`,
      }),
      { expiresIn },
    );
  }
}

export function createS3ArtifactStore(options: CreateS3ArtifactStoreOptions): S3ArtifactStore {
  const { bucket, defaultDownloadExpirySeconds, ...clientConfig } = options;
  const client = new S3Client(clientConfig);
  return new S3ArtifactStore(client, {
    bucket,
    ...(defaultDownloadExpirySeconds === undefined ? {} : { defaultDownloadExpirySeconds }),
  });
}
