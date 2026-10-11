import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { createPrivateBetaWebHandler } from "../src/ui.js";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("private-beta tester UI", () => {
  it("serves a locked-down same-origin UI and delegates API paths", async () => {
    let delegated = 0;
    const handler = createPrivateBetaWebHandler(async (_request, response) => {
      delegated += 1;
      response.statusCode = 204;
      response.end();
    });
    const server = createServer((request, response) => void handler(request, response));
    const baseUrl = await listen(server);

    try {
      const page = await fetch(`${baseUrl}/`);
      expect(page.status).toBe(200);
      expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
      const html = await page.text();
      expect(html).toContain("Generate a Factorio mod");
      expect(html).toContain('id="token"');
      expect(html).toContain('src="/app.js"');

      const script = await fetch(`${baseUrl}/app.js`);
      expect(script.status).toBe(200);
      const javascript = await script.text();
      expect(javascript).toContain("sessionStorage");
      expect(javascript).toContain('Accept: "application/json"');
      expect(javascript).toContain("/feedback");
      expect(javascript).toContain("/retry");

      const css = await fetch(`${baseUrl}/app.css`);
      expect(css.status).toBe(200);
      expect(css.headers.get("content-type")).toContain("text/css");

      const api = await fetch(`${baseUrl}/v1/generations/example`);
      expect(api.status).toBe(204);
      expect(delegated).toBe(1);
    } finally {
      await close(server);
    }
  });
});
