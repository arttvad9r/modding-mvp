import { smokeS3CompatibleProvider } from "./smoke.js";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boolean(name: string, fallback: boolean): boolean {
  const value = optional(name);
  if (value === undefined) return fallback;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  throw new Error(`${name} must be true/false or 1/0`);
}

async function main(): Promise<void> {
  const accessKeyId = optional("S3_ACCESS_KEY_ID");
  const secretAccessKey = optional("S3_SECRET_ACCESS_KEY");
  if ((accessKeyId === undefined) !== (secretAccessKey === undefined)) {
    throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together");
  }
  const endpoint = optional("S3_ENDPOINT");
  const result = await smokeS3CompatibleProvider({
    bucket: required("S3_BUCKET"),
    region: optional("S3_REGION") ?? "us-east-1",
    ...(endpoint === undefined ? {} : { endpoint }),
    forcePathStyle: boolean("S3_FORCE_PATH_STYLE", false),
    ...(accessKeyId === undefined || secretAccessKey === undefined
      ? {}
      : { credentials: { accessKeyId, secretAccessKey } }),
  });
  process.stdout.write(`${JSON.stringify({ status: "OK", ...result })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "ERROR",
    message: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
});
