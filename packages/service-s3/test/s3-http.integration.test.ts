import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { describe, expect, it } from "vitest";

import { createS3ArtifactStore } from "../src/index.js";

async function readBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return new Uint8Array(Buffer.concat(chunks));
}

function sendBytes(response: ServerResponse, bytes: Uint8Array): void {
  response.statusCode = 200;
  response.setHeader("content-type", "application/zip");
  response.setHeader("content-length", String(bytes.byteLength));
  response.end(Buffer.from(bytes));
}

describe("S3ArtifactStore AWS SDK HTTP integration", () => {
  it("uploads through PutObject and serves the same bytes through a short-lived presigned GET", async () => {
    const objects = new Map<string, Uint8Array>();
    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "PUT") {
        objects.set(url.pathname, await readBody(request));
        response.statusCode = 200;
        response.setHeader("etag", '"local-test-etag"');
        response.end();
        return;
      }
      if (request.method === "GET") {
        const bytes = objects.get(url.pathname);
        if (!bytes) {
          response.statusCode = 404;
          response.end();
          return;
        }
        sendBytes(response, bytes);
        return;
      }
      response.statusCode = 405;
      response.end();
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Missing local S3 address");
      const endpoint = `http://127.0.0.1:${address.port}`;
      const store = createS3ArtifactStore({
        endpoint,
        region: "us-east-1",
        bucket: "modding-artifacts",
        forcePathStyle: true,
        credentials: {
          accessKeyId: "local-test-access",
          secretAccessKey: "local-test-secret",
        },
      });
      const bytes = new TextEncoder().encode("validated factorio zip bytes");
      const artifact = await store.put({
        key: "generations/77777777-7777-4777-8777-777777777777/example-mod_0.1.0.zip",
        fileName: "example-mod_0.1.0.zip",
        contentType: "application/zip",
        bytes,
      });

      expect(objects.get(`/modding-artifacts/${artifact.key}`)).toEqual(bytes);

      const url = await store.createDownloadUrl(artifact, 120);
      const parsed = new URL(url);
      expect(parsed.origin).toBe(endpoint);
      expect(parsed.searchParams.get("X-Amz-Expires")).toBe("120");
      expect(parsed.searchParams.get("response-content-disposition")).toContain(
        "example-mod_0.1.0.zip",
      );
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
